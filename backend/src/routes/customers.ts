import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk, sendCreated, sendList, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { parsePagination, encodeCursor } from '../lib/cursor.js';
import { applyLoyalty } from '../lib/loyalty.js';

/*
 * /api/v1/customers — walk-in directory + loyalty (behind requireAuth).
 *
 *   GET    /                     list (cursor); ?q= name/phone contains
 *   POST   /                     create a customer
 *   GET    /:id                  customer + last 10 sales + balance
 *   PATCH  /:id                  update profile fields
 *   DELETE /:id                  delete (409 if it has sales history)
 *   GET    /:id/loyalty          points ledger + running balance
 *   POST   /:id/loyalty/adjust   manual ± adjustment
 *   POST   /:id/loyalty/redeem   redeem points (always −)
 *
 * Sale-time loyalty EARN lives in lib/sell.ts and is not handled here.
 */

const router = Router();

const optionalText = (max: number) => z.string().trim().max(max).nullish();

const createBody = z.object({
  name: z.string().trim().min(1).max(120),
  phone: optionalText(40),
  email: z.string().trim().email().max(200).nullish(),
  note: optionalText(500),
});

const patchBody = createBody.partial();

const adjustBody = z.object({
  points: z.number().int().refine((n) => n !== 0, 'points must be nonzero'),
  reason: z.string().trim().max(200).optional(),
});

const redeemBody = z.object({
  points: z.number().int().positive(),
});

async function findCustomer(accountId: string, id: string) {
  const customer = await prisma.customer.findFirst({ where: { id, accountId } });
  if (!customer) throw new ApiError(404, 'NOT_FOUND', 'Customer not found');
  return customer;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const { limit, cursor } = parsePagination(req.query);
    const rows = await prisma.customer.findMany({
      where: {
        accountId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
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

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = createBody.parse(req.body);
    const customer = await prisma.customer.create({
      data: { id: newId('cus'), accountId, ...body },
    });
    sendCreated(res, req, { customer });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const customer = await findCustomer(accountId, String(req.params.id));
    const transactions = await prisma.transaction.findMany({
      where: { accountId, customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, number: true, total: true, createdAt: true, status: true },
    });
    sendOk(res, req, { customer, transactions, loyaltyPoints: customer.loyaltyPoints });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = patchBody.parse(req.body);
    const existing = await findCustomer(accountId, String(req.params.id));
    const customer = await prisma.customer.update({ where: { id: existing.id }, data: body });
    sendOk(res, req, { customer });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const existing = await findCustomer(accountId, String(req.params.id));
    const sales = await prisma.transaction.count({ where: { accountId, customerId: existing.id } });
    if (sales > 0) throw new ApiError(409, 'CONFLICT', 'Customer has sales history');
    await prisma.customer.delete({ where: { id: existing.id } });
    sendOk(res, req, { id: existing.id, deleted: true });
  }),
);

router.get(
  '/:id/loyalty',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const customer = await findCustomer(accountId, String(req.params.id));
    const entries = await prisma.loyaltyEntry.findMany({
      where: { accountId, customerId: customer.id },
      orderBy: { createdAt: 'desc' },
    });
    sendOk(res, req, { entries, balance: customer.loyaltyPoints });
  }),
);

router.post(
  '/:id/loyalty/adjust',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = adjustBody.parse(req.body);
    const result = await applyLoyalty(accountId, String(req.params.id), body.points, body.reason ?? 'adjust');
    sendOk(res, req, result);
  }),
);

router.post(
  '/:id/loyalty/redeem',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = redeemBody.parse(req.body);
    const result = await applyLoyalty(accountId, String(req.params.id), -body.points, 'redeem');
    sendOk(res, req, result);
  }),
);

export default router;
