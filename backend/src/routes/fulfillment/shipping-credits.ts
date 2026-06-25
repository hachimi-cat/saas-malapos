import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { sendOk, sendErr } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { getPlugipayClient, hostedCheckoutUrl, plugipayConfigured } from '../../lib/plugipay.js';
import { requireMerchantClient, handleFulkrumaError } from '../../services/fulkruma-proxy.js';

/*
 * /api/v1/fulfillment/shipping-credits — prepaid courier balance. malapos
 * port of storlaunch's routes/shipping-credits.ts.
 *
 *   GET  /                 — Fulkruma balance (proxy)
 *   GET  /transactions     — Fulkruma ledger (proxy)
 *   POST /topup            — open a Plugipay hosted checkout the merchant
 *                            pays; the plugipay webhook credits Fulkruma.
 *
 * Balance + ledger ride the gated per-merchant Fulkruma client. Top-up
 * charges the merchant via the Malapos Plugipay billing workspace (same
 * client as tier billing, routes/billing.ts) and stamps the metadata the
 * webhook routes on. requireAuth at the mount.
 */

const router = Router();

const PUBLIC_URL = () => process.env.MALAPOS_PUBLIC_URL ?? 'https://malapos.com';

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const balance = await client.shippingCredits.get();
      return sendOk(res, req, balance);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

router.get(
  '/transactions',
  asyncHandler(async (req, res, next) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 30;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const result = await client.shippingCredits.listTransactions({ limit, cursor });
      return sendOk(res, req, result);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

const topupSchema = z.object({
  // IDR; min 10k so the VA fee doesn't eat the topup, max 10M so we don't
  // strand huge amounts in pending checkout.
  amount: z.number().int().min(10_000).max(10_000_000),
});

router.post(
  '/topup',
  asyncHandler(async (req, res, next) => {
    const accountId = req.auth!.accountId as string;
    let body: z.infer<typeof topupSchema>;
    try {
      body = topupSchema.parse(req.body);
    } catch {
      return sendErr(res, req, 400, 'VALIDATION_ERROR', 'amount must be Rp 10,000–10,000,000');
    }

    // Gate: the Fulfillment module must be on (and a Fulkruma workspace
    // provisioned) before a merchant can buy credits for it.
    const settings = await prisma.posSettings.findUnique({
      where: { accountId },
      select: { fulkrumaAccountId: true, modulesEnabled: true },
    });
    const modules = (settings?.modulesEnabled as { fulfillment?: boolean } | null) ?? {};
    if (modules.fulfillment !== true || !settings?.fulkrumaAccountId) {
      return sendErr(
        res,
        req,
        409,
        'FULFILLMENT_MODULE_DISABLED',
        'Enable the Fulfillment module to top up shipping credits',
      );
    }

    if (!plugipayConfigured()) {
      return sendErr(res, req, 503, 'NOT_CONFIGURED', 'Plugipay billing is not configured');
    }

    try {
      const client = getPlugipayClient();
      const baseUrl = PUBLIC_URL();
      const session = await client.checkoutSessions.create({
        amount: body.amount,
        currency: 'IDR',
        methods: ['qris', 'va', 'ewallet', 'card'],
        successUrl: `${baseUrl}/dashboard/fulfillment/shipping-credits?toppedup=${body.amount}`,
        cancelUrl: `${baseUrl}/dashboard/fulfillment/shipping-credits`,
        lineItems: [
          {
            name: `Shipping credit top-up — Rp ${body.amount.toLocaleString('id-ID')}`,
            quantity: 1,
            unitAmount: body.amount,
          },
        ],
        metadata: {
          // The plugipay webhook routes on these to credit Fulkruma.
          shippingCreditTopup: 'true',
          malaposAccountId: accountId,
          fulkrumaAccountId: settings.fulkrumaAccountId,
          requestedAmount: String(body.amount),
        },
      });

      return sendOk(res, req, {
        checkoutUrl: hostedCheckoutUrl(session),
        sessionId: session.id,
        amount: body.amount,
      });
    } catch (err) {
      return next(err);
    }
  }),
);

export default router;
