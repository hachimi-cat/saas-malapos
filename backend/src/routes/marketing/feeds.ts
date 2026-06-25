/*
 * Marketing → Product feed config. Thin proxy to Ripllo via the gated
 * per-merchant client. Malapos port of storlaunch's account-feeds.ts;
 * the Ripllo workspace id lives on PosSettings.ripploAccountId (set at
 * module-enable time). Feed XML is served by Ripllo at
 * <RIPLLO_BASE_URL>/api/v1/feeds/google/<ripploAccountId>.xml; /preview
 * 302-redirects there.
 *
 * Mounted at /api/v1/account/feeds (requireAuth at the mount).
 */
import { Router } from 'express';
import { z } from 'zod';
import { sendOk, sendErr } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { prisma } from '../../lib/db.js';
import { requireRipploClient, handleRipploError } from '../../services/ripllo-proxy.js';

const router = Router();

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  defaultGoogleProductCategory: z.string().max(500).optional().nullable(),
  includeUnpublished: z.boolean().optional(),
  marketingCampaignId: z.string().nullable().optional(),
});

async function ripploAccountIdFor(accountId: string): Promise<string | null> {
  const row = await prisma.posSettings.findUnique({
    where: { accountId },
    select: { ripploAccountId: true },
  });
  return row?.ripploAccountId ?? null;
}

function ripploBase(): string {
  return process.env.RIPLLO_BASE_URL ?? 'https://ripllo.com';
}

function feedUrls(ripploAccountId: string): { google: string; meta: string; tiktok: string } {
  // Ripllo only exposes Google Merchant Center XML today; Meta + TikTok
  // point at the same feed until their schemas are verified.
  const google = `${ripploBase()}/api/v1/feeds/google/${ripploAccountId}.xml`;
  return { google, meta: google, tiktok: google };
}

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireRipploClient(req.auth!.accountId as string);
      const config = await client.feeds.getConfig();
      const ripploId = await ripploAccountIdFor(req.auth!.accountId as string);
      return sendOk(res, req, { ...config, urls: ripploId ? feedUrls(ripploId) : null });
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
      const row = await client.feeds.updateConfig(body);
      const ripploId = await ripploAccountIdFor(req.auth!.accountId as string);
      return sendOk(res, req, { ...row, urls: ripploId ? feedUrls(ripploId) : null });
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

router.get(
  '/preview',
  asyncHandler(async (req, res, next) => {
    try {
      const format = String(req.query.format ?? 'google');
      if (!['google', 'meta', 'tiktok'].includes(format)) {
        return sendErr(res, req, 400, 'VALIDATION_ERROR', 'format must be google | meta | tiktok');
      }
      const ripploId = await ripploAccountIdFor(req.auth!.accountId as string);
      if (!ripploId) {
        return sendErr(
          res,
          req,
          409,
          'MARKETING_MODULE_DISABLED',
          'Marketing module is not enabled for this account',
        );
      }
      const url = `${ripploBase()}/api/v1/feeds/google/${ripploId}.xml?t=${Date.now()}`;
      res.redirect(302, url);
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
