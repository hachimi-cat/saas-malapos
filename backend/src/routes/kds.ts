import { Router } from 'express';
import type { KdsState, Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { sendOk, sendList, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { writeOutbox } from '../lib/outbox.js';

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
 *   POST  /:id/advance         advance ALL of a ticket's items one step
 *   POST  /:id/back            move ALL of a ticket's items back one step (UNDO)
 *   POST  /items/:itemId/advance   advance ONE item one step
 *   POST  /items/:itemId/back      move ONE item back one step (UNDO)
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

    sendOk(res, req, {
      item: { id: item.id, kdsState: prev },
      ticket: { id: item.transactionId, number: item.transaction.number, kdsState: synced },
    });
  }),
);

export default router;
