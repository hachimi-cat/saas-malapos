import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk, sendCreated, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';

/*
 * /api/v1/tables — F&B dine-in tables (behind requireAuth, account-scoped).
 * A table is a labelled seat at an outlet; it's "occupied" when it carries
 * an open bill — a PARKED transaction with that tableId. Tables are an
 * F&B-only affordance; retail/pharmacy workspaces simply never create any.
 *
 *   GET    /            list tables for an outlet (?outletId= required)
 *   GET    /floor       floor view: each active table + its open bill
 *   POST   /            create a table
 *   PATCH  /:id         edit a table
 *   DELETE /:id         delete (soft → isActive=false if it has sales)
 */

const router = Router();

const optionalText = (max: number) => z.string().trim().max(max).nullish();

// Floor-map layout fields. posX/posY are grid-cell coordinates on the editor
// canvas (nullable = unplaced); shape/width/height control how the table is
// drawn. Generous bounds so a large floor still fits.
const shapeEnum = z.enum(['SQUARE', 'ROUND', 'RECT']);
const posCoord = z.number().int().min(0).max(1000).nullish();
const cellSize = z.number().int().min(1).max(12);

const createBody = z.object({
  outletId: z.string().trim().min(1),
  // The floor to place the table on. Omitted → the outlet's first floor (a
  // "Main floor" is created if the outlet has none), so a table always lands
  // somewhere. See resolveFloorId().
  floorId: z.string().trim().min(1).nullish(),
  label: z.string().trim().min(1).max(60),
  zone: optionalText(60),
  seats: z.number().int().min(0).max(1000).nullish(),
  sortOrder: z.number().int().min(0).optional(),
  posX: posCoord,
  posY: posCoord,
  shape: shapeEnum.optional(),
  width: cellSize.optional(),
  height: cellSize.optional(),
});

const patchBody = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  // Move the table to another floor. Must belong to the same outlet.
  floorId: z.string().trim().min(1).optional(),
  zone: optionalText(60),
  seats: z.number().int().min(0).max(1000).nullish(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  posX: posCoord,
  posY: posCoord,
  shape: shapeEnum.optional(),
  width: cellSize.optional(),
  height: cellSize.optional(),
});

// PUT /tables/layout — bulk-save the floor arrangement in one call (the
// editor's Save). Each entry repositions one table; shape/size are optional.
// Scoped to a single floor when `floorId` is given (the editor always sends
// the active floor) so the returned table set is exactly that floor's.
const layoutBody = z.object({
  outletId: z.string().trim().min(1),
  floorId: z.string().trim().min(1).nullish(),
  tables: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        posX: posCoord,
        posY: posCoord,
        shape: shapeEnum.optional(),
        width: cellSize.optional(),
        height: cellSize.optional(),
      }),
    )
    .max(500),
});

/** Confirm the outlet belongs to this account (tables are outlet-scoped). */
async function assertOutlet(accountId: string, outletId: string): Promise<void> {
  const outlet = await prisma.outlet.findFirst({ where: { id: outletId, accountId }, select: { id: true } });
  if (!outlet) throw new ApiError(404, 'NOT_FOUND', 'Outlet not found');
}

/**
 * Resolve the floor a table should live on. A given `floorId` must belong to
 * this account + outlet (404 otherwise). When omitted, default to the outlet's
 * first floor (sortOrder, then name); if the outlet has no floor yet, create a
 * "Main floor" — so a newly created table always lands on a real floor.
 */
async function resolveFloorId(accountId: string, outletId: string, floorId?: string | null): Promise<string> {
  if (floorId) {
    const floor = await prisma.floor.findFirst({ where: { id: floorId, accountId, outletId }, select: { id: true } });
    if (!floor) throw new ApiError(404, 'NOT_FOUND', 'Floor not found at this outlet');
    return floor.id;
  }
  const first = await prisma.floor.findFirst({
    where: { accountId, outletId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true },
  });
  if (first) return first.id;
  const created = await prisma.floor.create({
    data: { id: newId('flr'), accountId, outletId, name: 'Main floor', sortOrder: 0 },
    select: { id: true },
  });
  return created.id;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const outletId = (req.query.outletId as string | undefined)?.trim();
    if (!outletId) throw new ApiError(400, 'VALIDATION_ERROR', 'outletId is required', 'outletId');
    const floorId = (req.query.floorId as string | undefined)?.trim();
    const includeInactive = req.query.includeInactive === 'true';
    const tables = await prisma.table.findMany({
      where: {
        accountId,
        outletId,
        ...(floorId ? { floorId } : {}),
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    sendOk(res, req, { tables });
  }),
);

/**
 * GET /floor?outletId= — the live floor: every active table with its current
 * open bill (the most-recent PARKED transaction seated at it, if any).
 * `openBill` is null for an available table.
 */
router.get(
  '/floor',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const outletId = (req.query.outletId as string | undefined)?.trim();
    if (!outletId) throw new ApiError(400, 'VALIDATION_ERROR', 'outletId is required', 'outletId');
    const floorId = (req.query.floorId as string | undefined)?.trim();

    const [tables, openBills] = await Promise.all([
      prisma.table.findMany({
        where: { accountId, outletId, isActive: true, ...(floorId ? { floorId } : {}) },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      }),
      prisma.transaction.findMany({
        where: { accountId, outletId, status: 'PARKED', tableId: { not: null } },
        select: { id: true, tableId: true, total: true, createdAt: true, _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // First (most-recent) open bill wins per table.
    const byTable = new Map<string, (typeof openBills)[number]>();
    for (const b of openBills) {
      if (b.tableId && !byTable.has(b.tableId)) byTable.set(b.tableId, b);
    }

    const floor = tables.map((table) => {
      const bill = byTable.get(table.id);
      return {
        table,
        openBill: bill
          ? {
              transactionId: bill.id,
              total: bill.total,
              itemCount: bill._count.items,
              openedAt: bill.createdAt,
            }
          : null,
      };
    });
    sendOk(res, req, { floor });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = createBody.parse(req.body);
    await assertOutlet(accountId, body.outletId);
    const dupe = await prisma.table.findFirst({
      where: { outletId: body.outletId, label: body.label },
      select: { id: true },
    });
    if (dupe) throw new ApiError(409, 'CONFLICT', `A table labelled "${body.label}" already exists at this outlet`);
    const floorId = await resolveFloorId(accountId, body.outletId, body.floorId);
    const table = await prisma.table.create({
      data: {
        id: newId('tbl'),
        accountId,
        outletId: body.outletId,
        floorId,
        label: body.label,
        zone: body.zone ?? null,
        seats: body.seats ?? null,
        sortOrder: body.sortOrder ?? 0,
        posX: body.posX ?? null,
        posY: body.posY ?? null,
        ...(body.shape !== undefined ? { shape: body.shape } : {}),
        ...(body.width !== undefined ? { width: body.width } : {}),
        ...(body.height !== undefined ? { height: body.height } : {}),
      },
    });
    sendCreated(res, req, { table });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = patchBody.parse(req.body);
    const existing = await prisma.table.findFirst({ where: { id: String(req.params.id), accountId } });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Table not found');
    if (body.label && body.label !== existing.label) {
      const dupe = await prisma.table.findFirst({
        where: { outletId: existing.outletId, label: body.label, id: { not: existing.id } },
        select: { id: true },
      });
      if (dupe) throw new ApiError(409, 'CONFLICT', `A table labelled "${body.label}" already exists at this outlet`);
    }
    // Moving the table to another floor: the target must belong to this outlet.
    const floorId = body.floorId !== undefined ? await resolveFloorId(accountId, existing.outletId, body.floorId) : undefined;
    const table = await prisma.table.update({
      where: { id: existing.id },
      data: {
        ...(floorId !== undefined ? { floorId } : {}),
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.zone !== undefined ? { zone: body.zone } : {}),
        ...(body.seats !== undefined ? { seats: body.seats } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.posX !== undefined ? { posX: body.posX } : {}),
        ...(body.posY !== undefined ? { posY: body.posY } : {}),
        ...(body.shape !== undefined ? { shape: body.shape } : {}),
        ...(body.width !== undefined ? { width: body.width } : {}),
        ...(body.height !== undefined ? { height: body.height } : {}),
      },
    });
    sendOk(res, req, { table });
  }),
);

/**
 * PUT /layout — bulk-save the floor map. Repositions many tables in one
 * request (the editor's "Save layout"). Account + outlet scoped: every id
 * must belong to a table at this outlet, or the whole save 404s (no partial
 * writes). Returns the refreshed table set.
 */
router.put(
  '/layout',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = layoutBody.parse(req.body);
    await assertOutlet(accountId, body.outletId);
    const floorId = body.floorId ?? undefined;

    if (body.tables.length) {
      const ids = body.tables.map((t) => t.id);
      const owned = await prisma.table.findMany({
        where: { id: { in: ids }, accountId, outletId: body.outletId, ...(floorId ? { floorId } : {}) },
        select: { id: true },
      });
      const ownedIds = new Set(owned.map((t) => t.id));
      const stray = ids.find((id) => !ownedIds.has(id));
      if (stray) throw new ApiError(404, 'NOT_FOUND', `Table ${stray} not found at this outlet`);

      await prisma.$transaction(
        body.tables.map((t) =>
          prisma.table.update({
            where: { id: t.id },
            data: {
              posX: t.posX ?? null,
              posY: t.posY ?? null,
              ...(t.shape !== undefined ? { shape: t.shape } : {}),
              ...(t.width !== undefined ? { width: t.width } : {}),
              ...(t.height !== undefined ? { height: t.height } : {}),
            },
          }),
        ),
      );
    }

    const tables = await prisma.table.findMany({
      where: { accountId, outletId: body.outletId, isActive: true, ...(floorId ? { floorId } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    sendOk(res, req, { tables });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const existing = await prisma.table.findFirst({ where: { id: String(req.params.id), accountId } });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Table not found');
    const sales = await prisma.transaction.count({ where: { tableId: existing.id } });
    if (sales > 0) {
      // History references it — deactivate instead of orphaning sales.
      const table = await prisma.table.update({ where: { id: existing.id }, data: { isActive: false } });
      return sendOk(res, req, { table, deactivated: true });
    }
    await prisma.table.delete({ where: { id: existing.id } });
    sendOk(res, req, { id: existing.id, deleted: true });
  }),
);

export default router;
