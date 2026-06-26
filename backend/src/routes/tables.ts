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

const createBody = z.object({
  outletId: z.string().trim().min(1),
  label: z.string().trim().min(1).max(60),
  zone: optionalText(60),
  seats: z.number().int().min(0).max(1000).nullish(),
  sortOrder: z.number().int().min(0).optional(),
});

const patchBody = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  zone: optionalText(60),
  seats: z.number().int().min(0).max(1000).nullish(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

/** Confirm the outlet belongs to this account (tables are outlet-scoped). */
async function assertOutlet(accountId: string, outletId: string): Promise<void> {
  const outlet = await prisma.outlet.findFirst({ where: { id: outletId, accountId }, select: { id: true } });
  if (!outlet) throw new ApiError(404, 'NOT_FOUND', 'Outlet not found');
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const outletId = (req.query.outletId as string | undefined)?.trim();
    if (!outletId) throw new ApiError(400, 'VALIDATION_ERROR', 'outletId is required', 'outletId');
    const includeInactive = req.query.includeInactive === 'true';
    const tables = await prisma.table.findMany({
      where: { accountId, outletId, ...(includeInactive ? {} : { isActive: true }) },
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

    const [tables, openBills] = await Promise.all([
      prisma.table.findMany({
        where: { accountId, outletId, isActive: true },
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
    const table = await prisma.table.create({
      data: {
        id: newId('tbl'),
        accountId,
        outletId: body.outletId,
        label: body.label,
        zone: body.zone ?? null,
        seats: body.seats ?? null,
        sortOrder: body.sortOrder ?? 0,
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
    const table = await prisma.table.update({
      where: { id: existing.id },
      data: {
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.zone !== undefined ? { zone: body.zone } : {}),
        ...(body.seats !== undefined ? { seats: body.seats } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });
    sendOk(res, req, { table });
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
