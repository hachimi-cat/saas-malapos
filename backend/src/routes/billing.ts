import { Router } from 'express';
import { sendOk } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { TIER_DEFS, EARLY_ACCESS } from '../lib/billing.js';

/*
 * /api/v1/billing — public plan catalog. The dashboard billing card reads
 * GET /tiers so it never keeps its own copy of the limits. Paid checkout
 * (Plugipay) lands when early access ends.
 */

const router = Router();

router.get(
  '/tiers',
  asyncHandler(async (req, res) => {
    sendOk(res, req, { earlyAccess: EARLY_ACCESS, tiers: TIER_DEFS });
  }),
);

export default router;
