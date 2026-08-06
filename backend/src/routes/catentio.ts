import type { Request } from 'express';
import { createCatentioRouter, type CatentioEmbedUser } from '@forjio/catentio-embed';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../lib/db.js';
import { sendOk, sendErr } from '../lib/http.js';
import { catentioPilotEnabled } from '../lib/feature-flag-registry.js';
import { currentTier } from '../lib/entitlements.js';
import { tierDef } from '../lib/billing.js';
import {
  MALAPOS_DELEGATION_PREFIX,
  MALAPOS_PROFILE,
  type MalaposLimits,
} from '../lib/catentio-profile.js';

/**
 * The catentio BFF — malapos's consumption of @forjio/catentio-embed.
 * Everything mechanical (gates, buckets, credit pre-flight, delegation
 * minting, sanitizers, attachment/media serving) lives in the package;
 * this file is the product adapter: envelope, auth, flag, settings
 * storage, tier caps and the resource profile.
 */

/** Malapos tier → the CP's plan-grant tier. The CP's monthly credit
 *  grants are keyed on the linksnap-era names (free 50 / pro 500 /
 *  business 1200, still DRAFT); malapos's own tier name stays in
 *  `limits.plan` for the prompt. */
function grantPlan(tier: string): string {
  if (tier === 'free') return 'FREE';
  if (tier === 'business' || tier === 'enterprise') return 'BUSINESS';
  return 'PRO';
}

async function resolveUser(req: Request): Promise<CatentioEmbedUser | null> {
  const auth = req.auth as
    | { sub?: string; accountId?: string; email?: string; name?: string }
    | undefined;
  // API-key auth stamps `api_key:` subs — the assistant is per-user
  // (the flag allowlist holds usr_… ids) and acts as a person, never as
  // a workspace credential.
  if (!auth?.sub || !auth.accountId || auth.sub.startsWith('api_key:')) return null;
  return {
    sub: auth.sub,
    email: auth.email ?? '',
    name: auth.name ?? '',
    workspaceId: auth.accountId,
    plan: grantPlan(await currentTier(auth.accountId)),
  };
}

const embed = createCatentioRouter<MalaposLimits>({
  product: 'malapos',
  profile: MALAPOS_PROFILE,
  knownApiBases: ['https://malapos.forjio.com', 'https://staging-malapos.forjio.com'],
  authenticate: requireAuth,
  getUser: resolveUser,
  flagEnabled: (u) => catentioPilotEnabled(u.sub, u.email),
  envelope: {
    ok: (res, data) => sendOk(res, (res as any).req, data),
    err: (res, e) => sendErr(res, (res as any).req, e.status, e.code, e.message),
  },
  settings: {
    async getAutoApply(accountId) {
      const row = await prisma.assistantSettings.findUnique({ where: { accountId } });
      return row?.autoApply !== false;
    },
    async setAutoApply(accountId, autoApply) {
      await prisma.assistantSettings.upsert({
        where: { accountId },
        create: { accountId, autoApply },
        update: { autoApply },
      });
    },
  },
  async planLimits(u) {
    const tier = await currentTier(u.workspaceId);
    return { plan: tier, productLimit: tierDef(tier).productLimit };
  },
  // Malapos keeps no local roles (membership is Huudis-side); any
  // signed-in member of the workspace may flip the assistant setting.
  canWriteSettings: () => true,
  delegationPrefix: MALAPOS_DELEGATION_PREFIX,
});

export const clearCatentioGateState = embed.clearGateState;
export default embed.router;
