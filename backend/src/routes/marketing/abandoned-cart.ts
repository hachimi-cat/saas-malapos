/*
 * Marketing → Abandoned-cart recovery config + dashboard reads. Thin
 * proxy to Ripllo via the gated per-merchant client. Malapos port of
 * storlaunch's account-abandoned-cart.ts. Mounted at
 * /api/v1/account/abandoned-cart (requireAuth at the mount).
 */
import { Router } from 'express';
import { z } from 'zod';
import { sendOk } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireRipploClient, handleRipploError } from '../../services/ripllo-proxy.js';

const router = Router();

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  delayHours: z.number().int().min(1).max(168).optional(),
  emailSubject: z.string().min(1).max(200).optional(),
  emailPreview: z.string().min(1).max(200).optional(),
  discountCodeId: z.string().optional().nullable(),
  marketingCampaignId: z.string().nullable().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireRipploClient(req.auth!.accountId as string);
      const row = await client.abandonedCart.getConfig();
      return sendOk(res, req, row);
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

router.patch(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const body = updateSchema.parse(req.body ?? {});
      const client = await requireRipploClient(req.auth!.accountId as string);
      const row = await client.abandonedCart.updateConfig(body);
      return sendOk(res, req, row);
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

router.get(
  '/reminders',
  asyncHandler(async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
      const client = await requireRipploClient(req.auth!.accountId as string);
      const reminders = await client.abandonedCart.listReminders({ limit });
      return sendOk(res, req, reminders);
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

router.get(
  '/stats',
  asyncHandler(async (req, res, next) => {
    try {
      const windowDays = Math.min(parseInt(String(req.query.windowDays ?? '30'), 10) || 30, 365);
      const client = await requireRipploClient(req.auth!.accountId as string);
      const stats = await client.abandonedCart.stats({ windowDays });
      return sendOk(res, req, stats);
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

export default router;
