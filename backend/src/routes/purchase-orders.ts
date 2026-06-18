import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk, sendCreated, sendList, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { parsePagination, encodeCursor } from '../lib/cursor.js';
import { receivePurchaseOrder } from '../lib/purchasing.js';

/*
 * /api/v1/purchase-orders — restocking (behind requireAuth).
 *
 *   GET    /             list (cursor); ?status= ?outletId=
 *   POST   /             create a DRAFT PO with lines
 *   GET    /:id          detail (items + supplier)
 *   PATCH  /:id          edit lines/note/supplier while DRAFT
 *   POST   /:id/order    DRAFT → ORDERED
 *   POST   /:id/receive  receive stock (ORDERED/PARTIAL → PARTIAL/RECEIVED)
 *   POST   /:id/cancel   DRAFT/ORDERED → CANCELLED
 */

const router = Router();

const poItemBody = z.object({
  variantId: z.string().trim(),
  quantity: z.number().int().positive(),
  cost: z.number().int().min(0),
  batchNo: z.string().trim().max(120).nullish(),
  expiryDate: z.coerce.date().nullish(),
});

const createBody = z.object({
  outletId: z.string().trim(),
  supplierId: z.string().trim().nullish(),
  items: z.array(poItemBody).min(1),
  note: z.string().trim().max(1000).nullish(),
});

const patchBody = z.object({
  supplierId: z.string().trim().nullish(),
  items: z.array(poItemBody).min(1),
  note: z.string().trim().max(1000).nullish(),
});

const receiveBody = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().trim(),
        receivedQty: z.number().int().positive(),
        batchNo: z.string().trim().max(120).nullish(),
        expiryDate: z.coerce.date().nullish(),
      }),
    )
    .min(1),
});

const withDetail = {
  items: { orderBy: { createdAt: 'asc' } },
  supplier: { select: { id: true, name: true } },
} as const;

/** Verify the outlet + every line variant belong to the account. */
async function validateRefs(accountId: string, outletId: string, variantIds: string[]): Promise<void> {
  const outlet = await prisma.outlet.findFirst({ where: { id: outletId, accountId } });
  if (!outlet) throw new ApiError(404, 'NOT_FOUND', 'Outlet not found');
  const unique = [...new Set(variantIds)];
  const found = await prisma.productVariant.count({ where: { id: { in: unique }, accountId } });
  if (found !== unique.length) throw new ApiError(404, 'NOT_FOUND', 'One or more variants not found');
}

/** Per-account PO number: "PO-000001" (count existing + 1). */
async function nextNumber(accountId: string): Promise<string> {
  const count = await prisma.purchaseOrder.count({ where: { accountId } });
  return `PO-${String(count + 1).padStart(6, '0')}`;
}

function lineData(accountId: string, items: z.infer<typeof poItemBody>[]) {
  return items.map((it) => ({
    id: newId('poi'),
    accountId,
    variantId: it.variantId,
    quantity: it.quantity,
    cost: it.cost,
    batchNo: it.batchNo ?? null,
    expiryDate: it.expiryDate ? new Date(it.expiryDate) : null,
  }));
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { status, outletId } = req.query as Record<string, string | undefined>;
    const { limit, cursor } = parsePagination(req.query);
    const rows = await prisma.purchaseOrder.findMany({
      where: {
        accountId,
        ...(status ? { status: status as never } : {}),
        ...(outletId ? { outletId } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: withDetail,
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

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = createBody.parse(req.body);
    await validateRefs(accountId, body.outletId, body.items.map((i) => i.variantId));

    const number = await nextNumber(accountId);
    const total = body.items.reduce((s, i) => s + i.cost * i.quantity, 0);

    const po = await prisma.purchaseOrder.create({
      data: {
        id: newId('pur'),
        accountId,
        outletId: body.outletId,
        supplierId: body.supplierId ?? null,
        number,
        status: 'DRAFT',
        total,
        note: body.note ?? null,
        items: { create: lineData(accountId, body.items) },
      },
      include: withDetail,
    });
    sendCreated(res, req, { purchaseOrder: po });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: String(req.params.id), accountId },
      include: { items: { orderBy: { createdAt: 'asc' } }, supplier: true },
    });
    if (!po) throw new ApiError(404, 'NOT_FOUND', 'Purchase order not found');
    sendOk(res, req, { purchaseOrder: po });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = patchBody.parse(req.body);
    const existing = await prisma.purchaseOrder.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Purchase order not found');
    if (existing.status !== 'DRAFT') {
      throw new ApiError(409, 'CONFLICT', 'Only a draft purchase order can be edited');
    }
    await validateRefs(accountId, existing.outletId, body.items.map((i) => i.variantId));

    const total = body.items.reduce((s, i) => s + i.cost * i.quantity, 0);
    const po = await prisma.$transaction(async (tx) => {
      // Simplest replace: drop existing lines, recreate.
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseId: existing.id } });
      return tx.purchaseOrder.update({
        where: { id: existing.id },
        data: {
          supplierId: body.supplierId ?? null,
          note: body.note ?? null,
          total,
          items: { create: lineData(accountId, body.items) },
        },
        include: withDetail,
      });
    });
    sendOk(res, req, { purchaseOrder: po });
  }),
);

router.post(
  '/:id/order',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const existing = await prisma.purchaseOrder.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Purchase order not found');
    if (existing.status !== 'DRAFT') {
      throw new ApiError(409, 'CONFLICT', 'Only a draft purchase order can be ordered');
    }
    const po = await prisma.purchaseOrder.update({
      where: { id: existing.id },
      data: { status: 'ORDERED', orderedAt: new Date() },
      include: withDetail,
    });
    sendOk(res, req, { purchaseOrder: po });
  }),
);

router.post(
  '/:id/receive',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = receiveBody.parse(req.body);
    const bySub = (req.auth!.sub as string | undefined) ?? null;
    await receivePurchaseOrder(accountId, String(req.params.id), body.items, bySub);
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: String(req.params.id), accountId },
      include: { items: { orderBy: { createdAt: 'asc' } }, supplier: true },
    });
    sendOk(res, req, { purchaseOrder: po });
  }),
);

router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const existing = await prisma.purchaseOrder.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Purchase order not found');
    if (existing.status !== 'DRAFT' && existing.status !== 'ORDERED') {
      throw new ApiError(409, 'CONFLICT', `Cannot cancel a ${existing.status.toLowerCase()} purchase order`);
    }
    const po = await prisma.purchaseOrder.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED' },
      include: withDetail,
    });
    sendOk(res, req, { purchaseOrder: po });
  }),
);

export default router;
