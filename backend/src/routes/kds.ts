import { Router } from 'express';
import type { KdsState, Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { sendOk, sendList, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { writeOutbox } from '../lib/outbox.js';
import { emitFnbChange } from '../lib/realtime.js';

/*
 * /api/v1/kds — Kitchen Display System for F&B (behind requireAuth).
 *
 * A ticket is any transaction with a non-null kdsState (set to NEW at sale/
 * park time for FNB workspaces, see lib/sell.ts). Each TransactionItem now
 * carries its OWN kdsState; the ticket's effective state is the LEAST-advanced
 * active item, and Transaction.kdsState is kept in sync to that value so the
 * board grouping + "drops off when SERVED" still work. The board shows active
 * tickets (NEW/PREPARING/READY) oldest-first; once every item is SERVED the
 * order is SERVED and leaves the board.
 *
 *   GET   /                    active tickets (NEW/PREPARING/READY) + items (each w/ kdsState)
 *   GET   /ready               READY items grouped by table — the server's expo board
 *   POST  /:id/advance         advance ALL of a ticket's items one step
 *   POST  /:id/back            move ALL of a ticket's items back one step (UNDO)
 *   POST  /items/:itemId/advance   advance ONE item one step (READY→SERVED = "serve")
 *   POST  /items/:itemId/back      move ONE item back one step (UNDO)
 *   POST  /tables/:tableId/serve    serve ALL of a table's READY items at once
 */

const router = Router();

const ORDER: KdsState[] = ['NEW', 'PREPARING', 'READY', 'SERVED'];
const ACTIVE: KdsState[] = ['NEW', 'PREPARING', 'READY'];

/** One step forward (clamped at SERVED). */
function stepForward(state: KdsState): KdsState {
  const idx = ORDER.indexOf(state);
  return ORDER[Math.min(idx + 1, ORDER.length - 1)]!;
}

/** One step back (clamped at NEW). */
function stepBack(state: KdsState): KdsState {
  const idx = ORDER.indexOf(state);
  return ORDER[Math.max(idx - 1, 0)]!;
}

/**
 * The ticket's effective state = the LEAST-advanced item that still carries a
 * kdsState. If every item is SERVED the order is SERVED (and drops off the
 * board). Items with a null kdsState (non-F&B lines) are ignored.
 */
function leastAdvanced(states: (KdsState | null)[]): KdsState {
  const present = states.filter((s): s is KdsState => s != null);
  if (!present.length) return 'SERVED';
  return present.reduce((min, s) => (ORDER.indexOf(s) < ORDER.indexOf(min) ? s : min), present[0]!);
}

/**
 * Recompute Transaction.kdsState from its items and persist it inside `tx`.
 * Returns the synced order state. Call after any item-state change.
 */
async function syncOrderState(
  tx: Prisma.TransactionClient,
  transactionId: string,
): Promise<KdsState> {
  const items = await tx.transactionItem.findMany({
    where: { transactionId },
    select: { kdsState: true },
  });
  const next = leastAdvanced(items.map((i) => i.kdsState));
  await tx.transaction.update({ where: { id: transactionId }, data: { kdsState: next } });
  return next;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { outletId } = req.query as Record<string, string | undefined>;
    const rows = await prisma.transaction.findMany({
      where: {
        accountId,
        kdsState: { in: ACTIVE },
        ...(outletId ? { outletId } : {}),
      },
      include: {
        items: {
          select: {
            id: true,
            productName: true,
            variantName: true,
            quantity: true,
            modifiers: true,
            kdsState: true,
          },
        },
        outlet: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    sendList(res, req, rows, null, false);
  }),
);

// ── "Ready to serve" expo board (server-facing) ─────────────────────────────

/**
 * GET /ready — every item currently READY, grouped by table, oldest-first.
 *
 * This is the WAITER's surface for the dine-in serve step: the kitchen has
 * cooked items to READY and the server now picks them up and delivers them to
 * the table (READY→SERVED). Dine-in items group under their table's `label`;
 * READY items on a table-less ticket (takeaway/counter) fall back to one group
 * per ticket keyed by its receipt number. Account- (and optionally outlet-)
 * scoped.
 *
 * Shape: [{ tableId, tableLabel, tickets: [{ transactionId, number,
 *           items: [{ id, name, variantName, qty, modifiers, kdsState }] }] }]
 */
router.get(
  '/ready',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { outletId } = req.query as Record<string, string | undefined>;

    const rows = await prisma.transaction.findMany({
      where: {
        accountId,
        ...(outletId ? { outletId } : {}),
        items: { some: { kdsState: 'READY' } },
      },
      include: {
        items: {
          where: { kdsState: 'READY' },
          select: {
            id: true,
            productName: true,
            variantName: true,
            quantity: true,
            modifiers: true,
            kdsState: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        table: { select: { id: true, label: true } },
        customer: { select: { name: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });

    type ReadyItem = {
      id: string;
      name: string;
      variantName: string | null;
      qty: number;
      modifiers: unknown;
      kdsState: KdsState | null;
    };
    type ReadyTicket = {
      transactionId: string;
      number: string;
      /** When the order was opened — drives the "waiting Xm" badge. (Simplest
       *  reliable proxy for when the kitchen plated it; tickets only surface
       *  here once they carry a READY item.) */
      readyAt: string;
      customerName: string | null;
      note: string | null;
      orderType: string;
      items: ReadyItem[];
    };
    type ReadyGroup = { tableId: string | null; tableLabel: string; tickets: ReadyTicket[] };

    // Map preserves insertion (= oldest-first) order; dine-in tickets sharing a
    // table fold into one group, table-less tickets each get their own.
    const groups = new Map<string, ReadyGroup>();
    for (const t of rows) {
      if (!t.items.length) continue;
      const ticket: ReadyTicket = {
        transactionId: t.id,
        number: t.number,
        readyAt: t.createdAt.toISOString(),
        customerName: t.customer?.name ?? null,
        note: t.note,
        orderType: t.orderType,
        items: t.items.map((it) => ({
          id: it.id,
          name: it.productName,
          variantName: it.variantName,
          qty: it.quantity,
          modifiers: it.modifiers,
          kdsState: it.kdsState,
        })),
      };
      const key = t.tableId ?? `txn:${t.id}`;
      let g = groups.get(key);
      if (!g) {
        g = { tableId: t.tableId, tableLabel: t.table?.label ?? t.number, tickets: [] };
        groups.set(key, g);
      }
      g.tickets.push(ticket);
    }

    sendList(res, req, [...groups.values()], null, false);
  }),
);

// ── Whole-ticket controls (convenience) ─────────────────────────────────────

router.post(
  '/:id/advance',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const ticket = await prisma.transaction.findFirst({
      where: { id: String(req.params.id), accountId },
      include: { items: { select: { id: true, kdsState: true } } },
    });
    if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found');
    if (ticket.kdsState == null) throw new ApiError(409, 'CONFLICT', 'Not a kitchen ticket');

    const kdsItems = ticket.items.filter((i) => i.kdsState != null);
    if (!kdsItems.some((i) => i.kdsState !== 'SERVED')) {
      throw new ApiError(409, 'CONFLICT', 'Ticket is already served');
    }

    const synced = await prisma.$transaction(async (tx) => {
      for (const it of kdsItems) {
        const next = stepForward(it.kdsState!);
        if (next !== it.kdsState) {
          await tx.transactionItem.update({ where: { id: it.id }, data: { kdsState: next } });
        }
      }
      const state = await syncOrderState(tx, ticket.id);
      await writeOutbox(tx, {
        type: 'malapos.kds.advanced.v1',
        accountId,
        aggregateId: ticket.id,
        data: { transactionId: ticket.id, from: ticket.kdsState, to: state, scope: 'ticket' },
      });
      return state;
    });

    // Board change: the ticket moved a step (+ serve board, since a step into
    // or out of READY changes what the waiter sees).
    emitFnbChange(accountId, null, 'kds');
    emitFnbChange(accountId, null, 'serve');

    sendOk(res, req, { ticket: { id: ticket.id, number: ticket.number, kdsState: synced } });
  }),
);

router.post(
  '/:id/back',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const ticket = await prisma.transaction.findFirst({
      where: { id: String(req.params.id), accountId },
      include: { items: { select: { id: true, kdsState: true } } },
    });
    if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found');
    if (ticket.kdsState == null) throw new ApiError(409, 'CONFLICT', 'Not a kitchen ticket');

    const kdsItems = ticket.items.filter((i) => i.kdsState != null);
    if (!kdsItems.some((i) => i.kdsState !== 'NEW')) {
      throw new ApiError(409, 'CONFLICT', 'Ticket is already new');
    }

    const synced = await prisma.$transaction(async (tx) => {
      for (const it of kdsItems) {
        const prev = stepBack(it.kdsState!);
        if (prev !== it.kdsState) {
          await tx.transactionItem.update({ where: { id: it.id }, data: { kdsState: prev } });
        }
      }
      const state = await syncOrderState(tx, ticket.id);
      await writeOutbox(tx, {
        type: 'malapos.kds.reverted.v1',
        accountId,
        aggregateId: ticket.id,
        data: { transactionId: ticket.id, from: ticket.kdsState, to: state, scope: 'ticket' },
      });
      return state;
    });

    emitFnbChange(accountId, null, 'kds');
    emitFnbChange(accountId, null, 'serve');

    sendOk(res, req, { ticket: { id: ticket.id, number: ticket.number, kdsState: synced } });
  }),
);

// ── Per-item controls ───────────────────────────────────────────────────────

/** Fetch + validate an item belongs to the account and sits on a kitchen ticket. */
async function loadKdsItem(accountId: string, itemId: string) {
  const item = await prisma.transactionItem.findFirst({
    where: { id: itemId, accountId },
    select: {
      id: true,
      kdsState: true,
      transactionId: true,
      transaction: { select: { id: true, number: true, kdsState: true } },
    },
  });
  if (!item) throw new ApiError(404, 'NOT_FOUND', 'Item not found');
  if (item.transaction.kdsState == null || item.kdsState == null) {
    throw new ApiError(409, 'CONFLICT', 'Not a kitchen item');
  }
  return item;
}

router.post(
  '/items/:itemId/advance',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const item = await loadKdsItem(accountId, String(req.params.itemId));

    const next = stepForward(item.kdsState!);
    if (next === item.kdsState) throw new ApiError(409, 'CONFLICT', 'Item is already served');

    const synced = await prisma.$transaction(async (tx) => {
      await tx.transactionItem.update({ where: { id: item.id }, data: { kdsState: next } });
      const state = await syncOrderState(tx, item.transactionId);
      await writeOutbox(tx, {
        type: 'malapos.kds.item_advanced.v1',
        accountId,
        aggregateId: item.transactionId,
        data: {
          transactionId: item.transactionId,
          itemId: item.id,
          from: item.kdsState,
          to: next,
          orderState: state,
        },
      });
      return state;
    });

    // READY→SERVED (and any step) changes both the kitchen board and the
    // waiter's ready-to-serve board.
    emitFnbChange(accountId, null, 'kds');
    emitFnbChange(accountId, null, 'serve');

    sendOk(res, req, {
      item: { id: item.id, kdsState: next },
      ticket: { id: item.transactionId, number: item.transaction.number, kdsState: synced },
    });
  }),
);

router.post(
  '/items/:itemId/back',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const item = await loadKdsItem(accountId, String(req.params.itemId));

    const prev = stepBack(item.kdsState!);
    if (prev === item.kdsState) throw new ApiError(409, 'CONFLICT', 'Item is already new');

    const synced = await prisma.$transaction(async (tx) => {
      await tx.transactionItem.update({ where: { id: item.id }, data: { kdsState: prev } });
      const state = await syncOrderState(tx, item.transactionId);
      await writeOutbox(tx, {
        type: 'malapos.kds.item_reverted.v1',
        accountId,
        aggregateId: item.transactionId,
        data: {
          transactionId: item.transactionId,
          itemId: item.id,
          from: item.kdsState,
          to: prev,
          orderState: state,
        },
      });
      return state;
    });

    emitFnbChange(accountId, null, 'kds');
    emitFnbChange(accountId, null, 'serve');

    sendOk(res, req, {
      item: { id: item.id, kdsState: prev },
      ticket: { id: item.transactionId, number: item.transaction.number, kdsState: synced },
    });
  }),
);

// ── Serve a whole table (READY→SERVED for every ready item) ──────────────────

/**
 * POST /tables/:tableId/serve — advance every currently-READY item across all
 * of a table's active tickets to SERVED in one call, re-syncing each affected
 * ticket's order state so a fully-served ticket drops off both boards. The
 * per-item serve reuses POST /items/:itemId/advance (READY→SERVED); this is the
 * convenience "Serve all" for a table. Account- (and optionally outlet-) scoped;
 * validates the table belongs to the account.
 */
router.post(
  '/tables/:tableId/serve',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { outletId } = req.query as Record<string, string | undefined>;
    const tableId = String(req.params.tableId);

    const table = await prisma.table.findFirst({
      where: { id: tableId, accountId },
      select: { id: true, label: true, outletId: true },
    });
    if (!table) throw new ApiError(404, 'NOT_FOUND', 'Table not found');

    const tickets = await prisma.transaction.findMany({
      where: {
        accountId,
        tableId,
        ...(outletId ? { outletId } : {}),
        items: { some: { kdsState: 'READY' } },
      },
      include: { items: { where: { kdsState: 'READY' }, select: { id: true } } },
    });

    const itemIds = tickets.flatMap((t) => t.items.map((i) => i.id));
    if (!itemIds.length) throw new ApiError(409, 'CONFLICT', 'No ready items to serve');

    const ticketStates = await prisma.$transaction(async (tx) => {
      await tx.transactionItem.updateMany({
        where: { id: { in: itemIds }, accountId },
        data: { kdsState: 'SERVED' },
      });
      const states: { transactionId: string; kdsState: KdsState }[] = [];
      for (const t of tickets) {
        states.push({ transactionId: t.id, kdsState: await syncOrderState(tx, t.id) });
      }
      await writeOutbox(tx, {
        type: 'malapos.kds.served.v1',
        accountId,
        aggregateId: tableId,
        data: {
          tableId,
          tableLabel: table.label,
          itemIds,
          transactionIds: tickets.map((t) => t.id),
          count: itemIds.length,
        },
      });
      return states;
    });

    // Serving a whole table clears it from the ready board, advances each
    // ticket's kitchen state, and (when a ticket fully serves out) can free
    // the table on the floor.
    emitFnbChange(accountId, table.outletId, 'serve');
    emitFnbChange(accountId, table.outletId, 'kds');
    emitFnbChange(accountId, table.outletId, 'floor');

    sendOk(res, req, {
      tableId,
      tableLabel: table.label,
      served: itemIds.length,
      tickets: ticketStates,
    });
  }),
);

export default router;
