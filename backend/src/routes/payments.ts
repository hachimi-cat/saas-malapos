import { Router } from 'express';
import { z } from 'zod';
import { PlugipayError } from '@forjio/plugipay-node';
import { prisma } from '../lib/db.js';
import { sendOk, sendList, sendErr } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePaymentClient } from '../services/plugipay-module-service.js';

/*
 * /api/v1/payments — the Payment (Plugipay) module's dynamic-QRIS surface
 * for the sell screen, plus a workspace payments overview. A pure proxy
 * over the gated per-merchant Plugipay client
 * (services/plugipay-module-service.requirePaymentClient → throws
 * payment_module_disabled/409 when the module is off).
 *
 *   POST /qris              mint a QRIS checkout session for a parked sale
 *                           (or an ad-hoc amount); stamps the session id on
 *                           the sale's PENDING QRIS payment so the inbound
 *                           webhook can settle it.
 *   GET  /qris/:sessionId   poll session status (open|pending|completed|…)
 *   GET  /overview          balance + recent QRIS checkout sessions + payouts
 *
 * Mounted behind requireAuth in routes/index.ts. Mirrors routes/delivery.ts
 * (Fulkruma) — the gated-client proxy pattern. The webhook that settles a
 * QRIS sale lives in routes/webhooks-plugipay.ts (merchant-order branch).
 */

const router = Router();

const PUBLIC_URL = () => process.env.MALAPOS_PUBLIC_URL ?? 'https://malapos.com';

/** Translate a thrown Plugipay/module error into the Malapos envelope.
 *  The module gate throws a plain Error with code/status; the SDK throws
 *  PlugipayError. Everything else bubbles to the express error handler. */
function sendPlugipayErr(
  res: Parameters<typeof sendErr>[0],
  req: Parameters<typeof sendErr>[1],
  err: unknown,
) {
  const e = err as Error & { status?: number; code?: string; name?: string };
  if (e.code === 'payment_module_disabled') {
    return sendErr(res, req, 409, 'PAYMENT_MODULE_DISABLED', e.message);
  }
  if (e instanceof PlugipayError || e.name === 'PlugipayError') {
    const status = e.status && e.status >= 400 ? e.status : 502;
    return sendErr(res, req, status, e.code || 'PLUGIPAY_ERROR', e.message);
  }
  if (e.status && e.code) return sendErr(res, req, e.status, e.code, e.message);
  return sendErr(res, req, 502, 'PLUGIPAY_ERROR', e.message || 'Payment request failed');
}

const qrisBody = z
  .object({
    /** Settle THIS parked sale's QRIS payment via the minted session. */
    transactionId: z.string().trim().optional(),
    /** Ad-hoc amount (IDR) when not tied to a sale — e.g. a counter top-up. */
    amount: z.number().int().positive().optional(),
  })
  .refine((b) => b.transactionId || b.amount, {
    message: 'transactionId or amount is required',
  });

/**
 * POST /qris — mint a dynamic-QRIS checkout session.
 *
 * For a transactionId: the sale must be PARKED in this workspace with a
 * PENDING QRIS payment; the minted session amount is that payment's
 * amount, and the session id is stamped onto the payment so the webhook
 * settles the right sale. For an ad-hoc amount: a standalone session,
 * not tied to a sale (the cashier reconciles manually).
 */
router.post(
  '/qris',
  requireAuth,
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = qrisBody.parse(req.body);

    let amount = body.amount ?? 0;
    let paymentId: string | null = null;

    if (body.transactionId) {
      const txn = await prisma.transaction.findFirst({
        where: { id: body.transactionId, accountId },
        select: { id: true, status: true },
      });
      if (!txn) {
        return sendErr(res, req, 404, 'NOT_FOUND', 'Sale not found in this workspace', {
          param: 'transactionId',
        });
      }
      if (txn.status !== 'PARKED') {
        return sendErr(res, req, 409, 'CONFLICT', 'Sale is not awaiting payment (not parked)');
      }
      const payment = await prisma.payment.findFirst({
        where: { transactionId: txn.id, method: 'QRIS', status: 'PENDING' },
        select: { id: true, amount: true },
      });
      if (!payment) {
        return sendErr(res, req, 409, 'CONFLICT', 'No pending QRIS payment on this sale');
      }
      paymentId = payment.id;
      amount = payment.amount;
    }

    if (amount <= 0) {
      return sendErr(res, req, 422, 'VALIDATION_ERROR', 'amount must be positive');
    }

    try {
      const client = await requirePaymentClient(accountId);
      const session = await client.checkoutSessions.create({
        amount,
        currency: 'IDR',
        methods: ['qris'],
        successUrl: `${PUBLIC_URL()}/dashboard/sell?qris=success`,
        cancelUrl: `${PUBLIC_URL()}/dashboard/sell?qris=canceled`,
        metadata: {
          saleAccountId: accountId,
          ...(body.transactionId ? { saleId: body.transactionId } : {}),
        },
      });

      // Stamp the session id on the parked sale's QRIS payment so the
      // inbound webhook matches the completion back to it.
      if (paymentId) {
        await prisma.payment.update({
          where: { id: paymentId },
          data: { plugipayCheckoutSessionId: session.id, plugipayRef: session.id },
        });
      }

      return sendOk(res, req, {
        sessionId: session.id,
        hostedUrl: session.hostedUrl,
        qrUrl: session.hostedUrl,
        amount: session.amount,
        status: session.status,
      });
    } catch (err) {
      return sendPlugipayErr(res, req, err);
    }
  }),
);

/** GET /qris/:sessionId — poll the session status so the sell screen can
 *  wait for the customer's scan to confirm. */
router.get(
  '/qris/:sessionId',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const client = await requirePaymentClient(req.auth!.accountId as string);
      const session = await client.checkoutSessions.get(String(req.params.sessionId));
      return sendOk(res, req, {
        sessionId: session.id,
        status: session.status,
        amount: session.amount,
        completedAt: session.completedAt,
      });
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 404) return sendErr(res, req, 404, 'NOT_FOUND', 'Checkout session not found');
      return sendPlugipayErr(res, req, err);
    }
  }),
);

/**
 * GET /overview — a workspace payments dashboard via the merchant client:
 * available balance, recent QRIS checkout sessions, and recent payouts.
 * Each piece is best-effort (a workspace with no provider configured may
 * 404/empty individual calls) but the gate itself (409) short-circuits
 * when the module is off.
 */
router.get(
  '/overview',
  requireAuth,
  asyncHandler(async (req, res) => {
    let client;
    try {
      client = await requirePaymentClient(req.auth!.accountId as string);
    } catch (err) {
      return sendPlugipayErr(res, req, err);
    }

    const [balance, sessions, payouts] = await Promise.all([
      client.payouts.balance().catch(() => null),
      client.checkoutSessions.list({ limit: 20 }).catch(() => ({ data: [], cursor: null, hasMore: false })),
      client.payouts.list({ limit: 10 }).catch(() => ({ data: [], cursor: null, hasMore: false })),
    ]);

    return sendOk(res, req, {
      balance,
      sessions: sessions.data,
      payouts: payouts.data,
    });
  }),
);

export default router;
