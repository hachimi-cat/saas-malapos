import { Router } from 'express';
import { z } from 'zod';
import type { CheckoutMethod } from '@forjio/plugipay-node';
import { sendOk, sendCreated, sendList } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handlePlugipayError } from '../../services/plugipay-proxy.js';

/*
 * /api/v1/payments/checkout-sessions — checkout sessions on the
 * merchant's Plugipay workspace. Backs the "Checkout Sessions"
 * (Transactions) list. malapos port of storlaunch's
 * payment/checkout-sessions.ts. requireAuth at the mount.
 *
 * NOTE: the POS dynamic-QRIS minting flow lives in routes/payments.ts
 * (POST /payments/qris) — this router is the generic CRUD surface.
 */

const router = Router();

const createCheckoutSessionSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.enum(['IDR', 'USD']).default('IDR'),
  paymentMethods: z.array(z.string()).optional(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  customerId: z.string().optional().nullable(),
  expiresInMinutes: z.number().int().positive().optional(),
  metadata: z.record(z.string()).optional(),
});

const listCheckoutSessionsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().optional(),
  customerId: z.string().optional(),
});

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const body = createCheckoutSessionSchema.parse(req.body);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const session = await client.checkoutSessions.create({
        amount: body.amount,
        currency: body.currency,
        methods: (body.paymentMethods ?? []) as CheckoutMethod[],
        successUrl: body.successUrl,
        cancelUrl: body.cancelUrl,
        customerId: body.customerId ?? undefined,
        expiresInSec: (body.expiresInMinutes ?? 60) * 60,
        metadata: body.metadata ?? {},
      });
      return sendCreated(res, req, session);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const query = listCheckoutSessionsSchema.parse(req.query);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const page = await client.checkoutSessions.list({
        limit: query.limit,
        status: query.status,
        customerId: query.customerId,
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
      const session = await client.checkoutSessions.get(String(req.params.id));
      return sendOk(res, req, session);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

// Manual-adapter confirm — flips a pending_review session to completed.
router.post(
  '/:id/confirm',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const session = await client.checkoutSessions.confirm(String(req.params.id));
      return sendOk(res, req, session);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

export default router;
