import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { sendOk, sendErr } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import {
  effectiveTier,
  modulesAllowedForTier,
  isModuleAllowedForTier,
  MODULE_KEYS,
  type ModuleKey,
} from '../lib/billing.js';
import { getModules, setModuleEnabled } from '../services/modules-service.js';

/*
 * /api/v1/modules — merchant-facing partner-module registry. Modules
 * are PARTNER INTEGRATIONS only (payment/Plugipay, fulfillment/Fulkruma,
 * marketing/Ripllo); built-in POS features are not modules. Enabling a
 * module the first time auto-provisions the partner workspace. Tier-
 * gated: Free can't enable any module; paid tiers unlock all three.
 */

const router = Router();

/** Resolve the workspace's effective billing tier (lapsed/canceled
 *  fall back to free — same as the billing route + enforcement). */
async function tierFor(accountId: string) {
  const sub = await prisma.billingSubscription.findUnique({ where: { accountId } });
  return effectiveTier(sub);
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const [modules, tier] = await Promise.all([getModules(accountId), tierFor(accountId)]);
    sendOk(res, req, {
      modules,
      allowed: modulesAllowedForTier(tier),
      plan: tier,
    });
  }),
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { module, enabled } = (req.body ?? {}) as { module?: string; enabled?: boolean };

    if (!module || typeof enabled !== 'boolean') {
      return sendErr(res, req, 400, 'VALIDATION_ERROR', 'module (string) + enabled (bool) required');
    }
    // Whitelist — only toggle modules we've actually implemented.
    if (!(MODULE_KEYS as readonly string[]).includes(module)) {
      return sendErr(res, req, 422, 'UNKNOWN_MODULE', `module "${module}" is not available`, {
        param: 'module',
      });
    }
    const key = module as ModuleKey;

    // Tier gate — Free can enable nothing. Disabling is always allowed
    // so a downgraded merchant isn't trapped.
    if (enabled) {
      const tier = await tierFor(accountId);
      if (!isModuleAllowedForTier(tier, key)) {
        return sendErr(
          res,
          req,
          402,
          'PLAN_UPGRADE_REQUIRED',
          `The "${module}" module is not available on your current plan. Upgrade to a paid plan to enable it.`,
          { param: 'module' },
        );
      }
    }

    try {
      const result = await setModuleEnabled(accountId, key, enabled);
      sendOk(res, req, result);
    } catch (err) {
      const e = err as Error & { status?: number; code?: string; name?: string; requestId?: string };
      // Surface the partner (Plugipay/Fulkruma/Ripllo) error so the
      // merchant sees WHY the toggle failed instead of a generic 500.
      console.error('[modules] toggle failed:', {
        accountId,
        module,
        enabled,
        name: e.name,
        code: e.code,
        status: e.status,
        message: e.message,
      });
      if (e.name === 'PlugipayError' || e.name === 'FulkrumaError' || e.name === 'RiplloError') {
        return sendErr(
          res,
          req,
          e.status && e.status >= 400 ? e.status : 502,
          e.code ?? 'PARTNER_ERROR',
          e.message,
        );
      }
      if (e.status && e.code) return sendErr(res, req, e.status, e.code, e.message);
      return sendErr(res, req, 500, 'MODULE_TOGGLE_FAILED', e.message || 'Failed to toggle module');
    }
  }),
);

export default router;
