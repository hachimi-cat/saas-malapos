/*
 * Marketing → Referral program config + stats. Thin proxy to Ripllo via
 * the gated per-merchant client. Malapos port of storlaunch's
 * account-referrals.ts; the plan gate is dropped (module access is the
 * only gate in Malapos). /links + /attributions stub to empty rows —
 * Ripllo doesn't yet expose merchant-scoped list endpoints with customer
 * hydration (same as storlaunch). Mounted at /api/v1/account/referrals
 * (requireAuth at the mount).
 */
import { Router } from 'express';
import { z } from 'zod';
import { sendOk } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireRipploClient, handleRipploError } from '../../services/ripllo-proxy.js';

const router = Router();

const programSchema = z.object({
  enabled: z.boolean().optional(),
  rewardType: z.enum(['percent', 'fixed', 'shipping_percent', 'shipping_fixed']),
  referrerValue: z.number().int().positive(),
  refereeValue: z.number().int().positive(),
  currency: z.string().min(1).max(8),
  minPurchaseAmount: z.number().int().nonnegative().nullable().optional(),
  rewardExpiryDays: z.number().int().min(1).max(365).optional(),
  attributionWindowDays: z.number().int().min(1).max(180).optional(),
  maxRewardsPerReferrer: z.number().int().positive().nullable().optional(),
  programTerms: z.string().max(10000).nullable().optional(),
  marketingCampaignId: z.string().nullable().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireRipploClient(req.auth!.accountId as string);
      const row = await client.referrals.getProgram();
      if (!row) {
        return sendOk(res, req, {
          enabled: false,
          rewardType: 'percent',
          referrerValue: 10,
          refereeValue: 10,
          currency: 'IDR',
          minPurchaseAmount: null,
          rewardExpiryDays: 90,
          attributionWindowDays: 30,
          maxRewardsPerReferrer: null,
          programTerms: null,
          marketingCampaignId: null,
        });
      }
      return sendOk(res, req, row);
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

router.put(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const body = programSchema.parse(req.body ?? {});
      const client = await requireRipploClient(req.auth!.accountId as string);
      const row = await client.referrals.putProgram(body);
      return sendOk(res, req, row);
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

router.get(
  '/links',
  asyncHandler(async (req, res) => sendOk(res, req, { rows: [], nextCursor: null })),
);

router.get(
  '/attributions',
  asyncHandler(async (req, res) => sendOk(res, req, { rows: [], nextCursor: null })),
);

router.get(
  '/stats',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireRipploClient(req.auth!.accountId as string);
      const stats = await client.referrals.stats();
      return sendOk(res, req, stats);
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

export default router;
