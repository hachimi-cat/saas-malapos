import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk, sendCreated, sendList, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { parsePagination, encodeCursor } from '../lib/cursor.js';
import { applyMovement } from '../lib/inventory.js';

/*
 * /api/v1/inventory — stock levels, adjustments, transfers, the movement
 * ledger and pharmacy batches (behind requireAuth). Every balance change
 * routes through applyMovement so StockLevel + StockMovement never drift.
 *
 *   GET  /levels      on-hand per (outlet, variant); ?outletId= ?low=true
 *   POST /adjust      manual stock-take correction (signed delta)
 *   PUT  /reorder     set the low-stock threshold (upserts the level)
 *   POST /transfer    move stock between two outlets (one transaction)
 *   GET  /movements   the append-only ledger; ?outletId= ?variantId=
 *   GET  /batches     dated lots (pharmacy); ?outletId= ?variantId= ?all=
 *   POST /batches     receive a lot (+ PURCHASE movement)
 *   GET  /expiring    lots expiring within ?days=30
 */

const router = Router();

/** Confirm an outlet belongs to the caller's account; throw 404 otherwise. */
async function assertOutlet(accountId: string, outletId: string): Promise<void> {
  const outlet = await prisma.outlet.findFirst({ where: { id: outletId, accountId }, select: { id: true } });
  if (!outlet) throw new ApiError(404, 'NOT_FOUND', 'Outlet not found');
}

/** Confirm a variant belongs to the caller's account; throw 404 otherwise. */
async function assertVariant(accountId: string, variantId: string): Promise<void> {
  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, accountId },
    select: { id: true },
  });
  if (!variant) throw new ApiError(404, 'NOT_FOUND', 'Variant not found');
}

// Surface product/variant/SKU alongside each level/batch so the UI can label rows.
const variantSummary = {
  variant: { select: { id: true, name: true, sku: true, barcode: true, product: { select: { name: true } } } },
} as const;

// ── Levels ──

router.get(
  '/levels',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { outletId, low } = req.query as Record<string, string | undefined>;
    const levels = await prisma.stockLevel.findMany({
      where: {
        accountId,
        ...(outletId ? { outletId } : {}),
        ...(low === 'true'
          ? { reorderPoint: { gt: 0 }, quantity: { lte: prisma.stockLevel.fields.reorderPoint } }
          : {}),
      },
      include: variantSummary,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    sendOk(res, req, { levels });
  }),
);

const adjustBody = z.object({
  outletId: z.string().trim(),
  variantId: z.string().trim(),
  qtyDelta: z.number().int(),
  reason: z.string().trim().max(300).nullish(),
});

router.post(
  '/adjust',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const bySub = req.auth!.sub as string | undefined;
    const body = adjustBody.parse(req.body);
    if (body.qtyDelta === 0) throw new ApiError(422, 'VALIDATION_ERROR', 'qtyDelta must be non-zero');
    await assertOutlet(accountId, body.outletId);
    await assertVariant(accountId, body.variantId);

    const quantity = await prisma.$transaction((tx) =>
      applyMovement(tx, {
        accountId,
        outletId: body.outletId,
        variantId: body.variantId,
        type: 'ADJUSTMENT',
        qtyDelta: body.qtyDelta,
        refType: 'stock_take',
        reason: body.reason ?? null,
        bySub: bySub ?? null,
      }),
    );
    sendOk(res, req, { variantId: body.variantId, outletId: body.outletId, quantity });
  }),
);

const reorderBody = z.object({
  outletId: z.string().trim(),
  variantId: z.string().trim(),
  reorderPoint: z.number().int().min(0),
});

router.put(
  '/reorder',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = reorderBody.parse(req.body);
    await assertOutlet(accountId, body.outletId);
    await assertVariant(accountId, body.variantId);

    const level = await prisma.stockLevel.upsert({
      where: { outletId_variantId: { outletId: body.outletId, variantId: body.variantId } },
      create: {
        id: newId('lvl'),
        accountId,
        outletId: body.outletId,
        variantId: body.variantId,
        quantity: 0,
        reorderPoint: body.reorderPoint,
      },
      update: { reorderPoint: body.reorderPoint },
    });
    sendOk(res, req, { level });
  }),
);

const transferBody = z.object({
  fromOutletId: z.string().trim(),
  toOutletId: z.string().trim(),
  variantId: z.string().trim(),
  qty: z.number().int().positive(),
});

router.post(
  '/transfer',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const bySub = req.auth!.sub as string | undefined;
    const body = transferBody.parse(req.body);
    if (body.fromOutletId === body.toOutletId)
      throw new ApiError(422, 'VALIDATION_ERROR', 'Source and destination outlets must differ');
    await assertOutlet(accountId, body.fromOutletId);
    await assertOutlet(accountId, body.toOutletId);
    await assertVariant(accountId, body.variantId);

    const transferId = newId('stk');
    const { fromQuantity, toQuantity } = await prisma.$transaction(async (tx) => {
      const fromQuantity = await applyMovement(tx, {
        accountId,
        outletId: body.fromOutletId,
        variantId: body.variantId,
        type: 'TRANSFER_OUT',
        qtyDelta: -body.qty,
        refType: 'transfer',
        refId: transferId,
        bySub: bySub ?? null,
      });
      const toQuantity = await applyMovement(tx, {
        accountId,
        outletId: body.toOutletId,
        variantId: body.variantId,
        type: 'TRANSFER_IN',
        qtyDelta: body.qty,
        refType: 'transfer',
        refId: transferId,
        bySub: bySub ?? null,
      });
      return { fromQuantity, toQuantity };
    });
    sendOk(res, req, { fromQuantity, toQuantity });
  }),
);

// ── Movement ledger ──

router.get(
  '/movements',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { outletId, variantId } = req.query as Record<string, string | undefined>;
    const { limit, cursor } = parsePagination(req.query);
    const rows = await prisma.stockMovement.findMany({
      where: {
        accountId,
        ...(outletId ? { outletId } : {}),
        ...(variantId ? { variantId } : {}),
        ...(cursor
          ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const next = hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
    sendList(res, req, page, next, hasMore);
  }),
);

// ── Batches (pharmacy) ──

router.get(
  '/batches',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { outletId, variantId, all } = req.query as Record<string, string | undefined>;
    const batches = await prisma.stockBatch.findMany({
      where: {
        accountId,
        ...(outletId ? { outletId } : {}),
        ...(variantId ? { variantId } : {}),
        ...(all === 'true' ? {} : { qtyRemaining: { gt: 0 } }),
      },
      include: variantSummary,
      orderBy: { expiryDate: 'asc' },
      take: 200,
    });
    sendOk(res, req, { batches });
  }),
);

const batchBody = z.object({
  outletId: z.string().trim(),
  variantId: z.string().trim(),
  batchNo: z.string().trim().max(120).nullish(),
  expiryDate: z.string().trim().datetime().or(z.string().trim().date()).nullish(),
  qty: z.number().int().positive(),
  cost: z.number().int().min(0).optional(),
});

router.post(
  '/batches',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const bySub = req.auth!.sub as string | undefined;
    const body = batchBody.parse(req.body);
    await assertOutlet(accountId, body.outletId);
    await assertVariant(accountId, body.variantId);

    const batchId = newId('bat');
    const batch = await prisma.$transaction(async (tx) => {
      // Create empty; applyMovement(batchId) increments qtyRemaining to qty,
      // keeping the level, ledger and batch perfectly in lock-step.
      const created = await tx.stockBatch.create({
        data: {
          id: batchId,
          accountId,
          outletId: body.outletId,
          variantId: body.variantId,
          batchNo: body.batchNo ?? null,
          expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
          qtyRemaining: 0,
          cost: body.cost ?? 0,
        },
      });
      await applyMovement(tx, {
        accountId,
        outletId: body.outletId,
        variantId: body.variantId,
        type: 'PURCHASE',
        qtyDelta: body.qty,
        batchId,
        refType: 'batch',
        refId: batchId,
        bySub: bySub ?? null,
      });
      return { ...created, qtyRemaining: body.qty };
    });
    sendCreated(res, req, { batch });
  }),
);

router.get(
  '/expiring',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { outletId } = req.query as Record<string, string | undefined>;
    const days = (() => {
      const n = Number.parseInt(String(req.query.days ?? '30'), 10);
      return Number.isFinite(n) && n > 0 ? n : 30;
    })();
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const batches = await prisma.stockBatch.findMany({
      where: {
        accountId,
        ...(outletId ? { outletId } : {}),
        qtyRemaining: { gt: 0 },
        expiryDate: { not: null, lte: until },
      },
      include: variantSummary,
      orderBy: { expiryDate: 'asc' },
      take: 200,
    });
    sendOk(res, req, { batches });
  }),
);

export default router;
