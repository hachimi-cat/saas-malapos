import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { writeOutbox } from '../lib/outbox.js';
import { sendOk, sendErr } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { getPlugipayClient, hostedCheckoutUrl, plugipayConfigured } from '../lib/plugipay.js';
import {
  TIER_DEFS,
  EARLY_ACCESS,
  effectiveTier,
  isPaidTier,
  resolveBillingCurrency,
  tierDef,
  type BillingTier,
} from '../lib/billing.js';

/*
 * /api/v1/billing — public plan catalog + workspace plan & Plugipay
 * checkout.
 *
 * GET /tiers is PUBLIC (the /pricing page + the dashboard card read it
 * with no auth). Everything else is behind requireAuth (accountId =
 * the workspace from the BFF session / Bearer claims).
 *
 * PAID LAUNCH (2026-06-18): paid tiers are live — `EARLY_ACCESS`
 * (lib/billing.ts) is false, plans are charged via Plugipay /checkout
 * and limits are enforced (entitlements.ts). The flag remains as a
 * kill-switch: flipping it back to true reverts to free-for-all and the
 * dashboard disables the upgrade buttons while it's on. The webhook
 * (routes/webhooks-plugipay.ts) writes the BillingSubscription row when
 * a checkout completes.
 */

const router = Router();

const PUBLIC_URL = () => process.env.MALAPOS_PUBLIC_URL ?? 'https://malapos.com';

/** GET /tiers — public plan catalog. The /pricing page + the dashboard
 *  card read this so they never keep their own copy of the limits. */
router.get(
  '/tiers',
  asyncHandler(async (req, res) => {
    sendOk(res, req, { earlyAccess: EARLY_ACCESS, tiers: TIER_DEFS });
  }),
);

/** GET / — current subscription (free default when no row) +
 *  effectiveTier (what enforcement honors: lapsed/canceled fall back to
 *  free) + the tier table. */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const sub = await prisma.billingSubscription.findUnique({ where: { accountId } });
    sendOk(res, req, {
      subscription: sub ?? {
        id: null,
        accountId,
        tier: 'free' as BillingTier,
        status: 'active',
        plugipayCheckoutSessionId: null,
        currentPeriodEnd: null,
      },
      effectiveTier: effectiveTier(sub),
      earlyAccess: EARLY_ACCESS,
      tiers: TIER_DEFS,
    });
  }),
);

const checkoutBody = z.object({
  tier: z.enum(['free', 'starter', 'growth', 'business']),
  currency: z.enum(['IDR', 'USD']).optional(),
});

/** POST /checkout {tier, currency?} — create a Plugipay hosted checkout
 *  session for a paid tier; the browser redirects to data.hostedUrl.
 *  `currency` is the buyer's saved preference (the billing page passes
 *  it so the charge matches the price they were shown); absent, the
 *  CF-IPCountry geo-route decides. IDR rides the local rails, USD
 *  settles through PayPal only — PayPal cannot settle IDR. The
 *  subscription itself is only written when the
 *  plugipay.checkout_session.completed.v1 webhook lands (the metadata
 *  carries {accountId, tier} and is currency-agnostic). */
router.post(
  '/checkout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { tier, currency: bodyCurrency } = checkoutBody.parse(req.body);
    if (!isPaidTier(tier)) {
      return sendErr(res, req, 400, 'VALIDATION_ERROR', 'free needs no checkout', {
        param: 'tier',
      });
    }
    if (!plugipayConfigured()) {
      return sendErr(res, req, 503, 'NOT_CONFIGURED', 'Plugipay billing is not configured');
    }

    const accountId = req.auth!.accountId as string;
    const def = tierDef(tier);
    const currency = resolveBillingCurrency(bodyCurrency, req.headers['cf-ipcountry']);
    // Guard on the amount actually charged: a tier with no USD price
    // must refuse rather than create a $0 session.
    if (currency === 'USD' && def.priceUsdCents <= 0) {
      return sendErr(res, req, 503, 'USD_PRICE_MISSING', `No USD price for ${def.name}`);
    }
    const amount = currency === 'USD' ? def.priceUsdCents : def.priceIdr;
    const label =
      currency === 'USD'
        ? `Malapos ${def.name} — $${(def.priceUsdCents / 100).toFixed(2)}/mo`
        : `Malapos ${def.name} — Rp ${def.priceIdr.toLocaleString('id-ID')}/mo`;
    const client = getPlugipayClient();
    const session = await client.checkoutSessions.create({
      amount,
      currency,
      methods: currency === 'USD' ? ['paypal'] : ['qris', 'va', 'ewallet', 'card'],
      successUrl: `${PUBLIC_URL()}/dashboard/billing?status=success`,
      cancelUrl: `${PUBLIC_URL()}/dashboard/billing?status=canceled`,
      lineItems: [
        {
          name: label,
          quantity: 1,
          unitAmount: amount,
        },
      ],
      metadata: { accountId, tier },
    });

    sendOk(res, req, {
      checkoutSessionId: session.id,
      hostedUrl: hostedCheckoutUrl(session),
    });
  }),
);

/** POST /cancel — downgrade to Free. No refunds and no auto-renew
 *  exist, so cancel = keep the paid period's entitlement, then lapse
 *  to free (effectiveTier handles the grace). Idempotent. */
router.post(
  '/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const sub = await prisma.billingSubscription.findUnique({ where: { accountId } });
    if (!sub) {
      return sendErr(res, req, 404, 'NOT_FOUND', 'no subscription to cancel — you are on Free');
    }
    if (sub.status === 'canceled') {
      return sendOk(res, req, { subscription: sub, effectiveTier: effectiveTier(sub) });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.billingSubscription.update({
        where: { accountId },
        data: { status: 'canceled' },
      });
      await writeOutbox(tx, {
        type: 'malapos.billing.canceled.v1',
        accountId,
        aggregateId: u.id,
        data: {
          subscriptionId: u.id,
          tier: u.tier,
          paidThrough: u.currentPeriodEnd?.toISOString() ?? null,
        },
      });
      return u;
    });
    sendOk(res, req, { subscription: updated, effectiveTier: effectiveTier(updated) });
  }),
);

export default router;
