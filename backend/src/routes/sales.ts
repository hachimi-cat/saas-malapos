import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { sendOk, sendCreated, sendList, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { parsePagination, encodeCursor } from '../lib/cursor.js';
import { createSale, voidSale, discardParkedSale } from '../lib/sell.js';
import { refundSale } from '../lib/refund.js';

/*
 * /api/v1/sales — the checkout surface (behind requireAuth).
 *
 *   POST   /              ring up a sale (cart → transaction, see lib/sell.ts)
 *   GET    /              list (cursor-paginated); ?outletId= ?status= ?shiftId=
 *   GET    /:id           full receipt (items + payments)
 *   POST   /:id/void      reverse a completed sale (returns stock)
 */

const router = Router();

const modifierSchema = z.object({ name: z.string().trim().max(120), price: z.number().int().min(0) });
const lineSchema = z.object({
  variantId: z.string().trim(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().min(0).optional(),
  discount: z.number().int().min(0).optional(),
  modifiers: z.array(modifierSchema).max(20).optional(),
});
const paymentSchema = z.object({
  method: z.enum(['CASH', 'QRIS', 'CARD', 'GIFT_CARD', 'OTHER']),
  amount: z.number().int().min(0),
  tendered: z.number().int().min(0).optional(),
  reference: z.string().trim().max(200).optional(),
  plugipayRef: z.string().trim().max(120).optional(),
  status: z.enum(['PENDING', 'PAID', 'FAILED']).optional(),
});
const createBody = z.object({
  outletId: z.string().trim(),
  shiftId: z.string().trim().nullish(),
  customerId: z.string().trim().nullish(),
  items: z.array(lineSchema).min(1),
  orderDiscount: z.number().int().min(0).optional(),
  payments: z.array(paymentSchema).max(10).optional(),
  status: z.enum(['COMPLETED', 'PARKED']).optional(),
  note: z.string().trim().max(500).nullish(),
  // Marketing (Ripllo) module — ignored when the module is off.
  discountCode: z.string().trim().max(50).nullish(),
  redeemPoints: z.number().int().min(0).nullish(),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = createBody.parse(req.body);
    const id = await createSale(body, {
      accountId,
      cashierSub: (req.auth!.sub as string | undefined) ?? null,
      cashierName: (req.auth!.name as string | undefined) ?? null,
    });
    const sale = await prisma.transaction.findUnique({
      where: { id },
      include: { items: true, payments: true, customer: true },
    });
    sendCreated(res, req, { sale });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { outletId, status, shiftId } = req.query as Record<string, string | undefined>;
    const { limit, cursor } = parsePagination(req.query);
    const rows = await prisma.transaction.findMany({
      where: {
        accountId,
        ...(outletId ? { outletId } : {}),
        ...(shiftId ? { shiftId } : {}),
        ...(status ? { status: status as never } : {}),
        ...(cursor
          ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
          : {}),
      },
      include: { payments: { select: { method: true, amount: true } }, _count: { select: { items: true } } },
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

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const sale = await prisma.transaction.findFirst({
      where: { id: String(req.params.id), accountId },
      include: { items: true, payments: true, customer: true, outlet: true },
    });
    if (!sale) throw new ApiError(404, 'NOT_FOUND', 'Sale not found');
    sendOk(res, req, { sale });
  }),
);

router.post(
  '/:id/void',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const reason = z.object({ reason: z.string().trim().max(300).nullish() }).parse(req.body ?? {}).reason ?? null;
    await voidSale(accountId, String(req.params.id), reason, (req.auth!.sub as string | undefined) ?? null);
    const sale = await prisma.transaction.findUnique({
      where: { id: String(req.params.id) },
      include: { items: true, payments: true },
    });
    sendOk(res, req, { sale });
  }),
);

/** POST /:id/discard — abandon a PARKED sale (e.g. an unpaid dynamic-QRIS
 *  sale). Pure status flip → VOIDED; no stock return (parked sales never
 *  deducted). Distinct from /void, which reverses a COMPLETED sale. */
router.post(
  '/:id/discard',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const reason = z.object({ reason: z.string().trim().max(300).nullish() }).parse(req.body ?? {}).reason ?? null;
    await discardParkedSale(accountId, String(req.params.id), reason);
    const sale = await prisma.transaction.findUnique({
      where: { id: String(req.params.id) },
      include: { items: true, payments: true },
    });
    sendOk(res, req, { sale });
  }),
);

const refundBody = z.object({
  lines: z
    .array(z.object({ transactionItemId: z.string().trim(), qty: z.number().int().positive() }))
    .max(100)
    .optional(),
  amount: z.number().int().positive().optional(),
  restock: z.boolean().optional(),
  refundToStoreCredit: z.boolean().optional(),
  reason: z.string().trim().max(300).nullish(),
});

router.post(
  '/:id/refund',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = refundBody.parse(req.body ?? {});
    const refundId = await refundSale(
      String(req.params.id),
      {
        lines: body.lines,
        amount: body.amount,
        restock: body.restock,
        refundToStoreCredit: body.refundToStoreCredit,
        reason: body.reason ?? null,
      },
      { accountId, bySub: (req.auth!.sub as string | undefined) ?? null },
    );
    const sale = await prisma.transaction.findUnique({
      where: { id: String(req.params.id) },
      include: { items: true, payments: true, refunds: true },
    });
    sendOk(res, req, { sale, refundId });
  }),
);

export default router;
