import { Router } from 'express';
import { z } from 'zod';
import type { FetchArgs } from '@forjio/plugipay-node';
import { sendOk, sendCreated, sendList, sendErr } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handlePlugipayError } from '../../services/plugipay-proxy.js';

/*
 * /api/v1/payments/subscriptions — recurring subscriptions on the
 * merchant's Plugipay workspace. malapos port of storlaunch's
 * payment/subscriptions.ts. requireAuth applied at the mount.
 */

const router = Router();

const createSubscriptionSchema = z.object({
  customerId: z.string().min(1),
  planId: z.string().min(1),
  priceId: z.string().min(1).optional(),
  trialEnd: z.string().datetime().optional(),
});

const updateSubscriptionSchema = z.object({
  status: z.enum(['active', 'paused']).optional(),
  action: z.enum(['pause', 'resume']).optional(),
});

const listSubscriptionsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().optional(),
  customerId: z.string().optional(),
  planId: z.string().optional(),
});

interface MaybePrices {
  prices?: { id?: string; active?: boolean }[];
  data?: { id?: string; active?: boolean }[];
}

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const accountId = req.auth!.accountId as string;
      const body = createSubscriptionSchema.parse(req.body);
      const client = await requireMerchantClient(accountId);

      // The Plugipay SDK's subscriptions.create requires a priceId, but a
      // Plan DTO no longer carries its prices inline — fetch the plan's
      // prices and pick the first active one (caller may also pass priceId).
      let priceId = body.priceId;
      if (!priceId) {
        const raw = await client.request<MaybePrices | { id?: string; active?: boolean }[]>({
          method: 'GET' as FetchArgs['method'],
          path: `/api/v1/plans/${body.planId}/prices`,
        });
        const prices = Array.isArray(raw) ? raw : (raw.prices ?? raw.data ?? []);
        priceId = prices.find((p) => p.active)?.id ?? prices[0]?.id;
      }
      if (!priceId) {
        return sendErr(res, req, 409, 'CONFLICT', 'Plan has no active price');
      }

      const sub = await client.subscriptions.create({
        customerId: body.customerId,
        planId: body.planId,
        priceId,
        trialDays: body.trialEnd
          ? Math.max(0, Math.ceil((new Date(body.trialEnd).getTime() - Date.now()) / 86_400_000))
          : undefined,
        collectionMethod: 'send_invoice',
      });
      return sendCreated(res, req, sub);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const query = listSubscriptionsSchema.parse(req.query);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const page = await client.subscriptions.list({
        limit: query.limit,
        customerId: query.customerId,
        planId: query.planId,
        status: query.status,
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
      const sub = await client.subscriptions.get(String(req.params.id));
      return sendOk(res, req, sub);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res, next) => {
    try {
      const body = updateSubscriptionSchema.parse(req.body);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const wantPause = body.status === 'paused' || body.action === 'pause';
      const wantResume = body.status === 'active' || body.action === 'resume';
      if (wantPause) {
        const sub = await client.subscriptions.pause(String(req.params.id));
        return sendOk(res, req, sub);
      }
      if (wantResume) {
        const sub = await client.subscriptions.resume(String(req.params.id));
        return sendOk(res, req, sub);
      }
      return sendErr(
        res,
        req,
        409,
        'UNSUPPORTED_OPERATION',
        'Plan changes via PATCH are not supported. Cancel and create a new subscription instead.',
      );
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res, next) => {
    try {
      const immediate = req.query.immediate === 'true';
      const client = await requireMerchantClient(req.auth!.accountId as string);
      await client.subscriptions.cancel(String(req.params.id), immediate ? 'now' : 'period_end');
      return res.status(204).send();
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

export default router;
