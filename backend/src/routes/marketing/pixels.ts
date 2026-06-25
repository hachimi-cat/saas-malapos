/*
 * Marketing → Ad-network pixel config. Thin proxy to Ripllo via the
 * gated per-merchant client. Malapos port of storlaunch's
 * account-pixels.ts. Mounted at /api/v1/account/pixels (requireAuth at
 * the mount).
 */
import { Router } from 'express';
import { z } from 'zod';
import { sendOk } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireRipploClient, handleRipploError } from '../../services/ripllo-proxy.js';

const router = Router();

const updateSchema = z.object({
  metaPixelId: z.string().max(64).optional().nullable(),
  metaCapiAccessToken: z.string().max(500).optional().nullable(),
  metaTestEventCode: z.string().max(64).optional().nullable(),
  googleAnalyticsId: z.string().max(64).optional().nullable(),
  googleAdsConversionId: z.string().max(64).optional().nullable(),
  googleAdsPurchaseLabel: z.string().max(64).optional().nullable(),
  tiktokPixelId: z.string().max(64).optional().nullable(),
  enabled: z.boolean().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireRipploClient(req.auth!.accountId as string);
      const row = await client.pixels.get();
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
      const row = await client.pixels.update(body);
      return sendOk(res, req, row);
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

export default router;
