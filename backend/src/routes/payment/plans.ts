import { Router } from 'express';
import { z } from 'zod';
import type { FetchArgs } from '@forjio/plugipay-node';
import { sendOk, sendCreated, sendList, sendErr } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handlePlugipayError } from '../../services/plugipay-proxy.js';

/*
 * /api/v1/payments/plans — recurring-billing Plans on the merchant's
 * Plugipay workspace. malapos port of storlaunch's payment/plans.ts.
 *
 * requireAuth is applied at the mount (routes/index.ts). The gate lives
 * in requireMerchantClient → 409 PAYMENT_MODULE_DISABLED when the
 * Payment module is off.
 */

const router = Router();

// Storlaunch UI accepts the legacy 'weekly|monthly|yearly' interval enum;
// the Plugipay SDK wants 'day|week|month|year'. Translate at the boundary.
const intervalMap: Record<string, 'day' | 'week' | 'month' | 'year'> = {
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
};

const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(200),
  amount: z.number().int().nonnegative(),
  currency: z.enum(['IDR', 'USD']).default('IDR'),
  interval: z.string().default('monthly'),
  trialDays: z.number().int().nonnegative().optional(),
});

const updatePlanSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  active: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const listPlansSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  active: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => v === true || v === 'true')
    .optional(),
});

const idemKey = () => `idk_${Date.now()}_${Math.random().toString(36).slice(2)}`;

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const accountId = req.auth!.accountId as string;
      const body = createPlanSchema.parse(req.body);
      const client = await requireMerchantClient(accountId);
      const plan = await client.plans.create({
        name: body.name,
        currency: body.currency,
        amount: body.amount,
        interval: intervalMap[body.interval] ?? 'month',
      });
      return sendCreated(res, req, plan);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const accountId = req.auth!.accountId as string;
      const query = listPlansSchema.parse(req.query);
      const client = await requireMerchantClient(accountId);
      const page = await client.plans.list({
        limit: query.limit,
        cursor: query.cursor,
        active: query.active,
      });
      return sendList(res, req, page.data, page.cursor, page.hasMore);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const plan = await client.plans.get(String(req.params.id));
      return sendOk(res, req, plan);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res, next) => {
    try {
      const body = updatePlanSchema.parse(req.body);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const plan = await client.plans.update(String(req.params.id), {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
      });
      return sendOk(res, req, plan);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

// Add a new price (currency variant) to an existing plan.
router.post(
  '/:id/prices',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const body = (req.body ?? {}) as {
        currency: 'IDR' | 'USD';
        model?: 'flat' | 'usage';
        unitAmount?: number;
        taxMode?: 'inclusive' | 'exclusive';
      };
      const price = await client.plans.addPrice(String(req.params.id), {
        currency: body.currency,
        model: body.model,
        unitAmount: body.unitAmount,
        taxMode: body.taxMode,
      });
      return sendCreated(res, req, price);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

// Archive/unarchive an individual price. PATCH on the price, not the plan.
// No SDK method for this, so proxy raw to Plugipay's /prices/:id.
router.patch(
  '/prices/:priceId',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const price = await client.request<unknown>({
        method: 'PATCH' as FetchArgs['method'],
        path: `/api/v1/prices/${req.params.priceId}`,
        body: req.body ?? {},
        idempotencyKey:
          typeof req.headers['idempotency-key'] === 'string'
            ? req.headers['idempotency-key']
            : idemKey(),
      });
      return sendOk(res, req, price);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      await client.plans.archive(String(req.params.id));
      return res.status(204).send();
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

export default router;
