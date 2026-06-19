/*
 * Partner-modules orchestrator. Mirrors storlaunch's
 * plugipay-module-service.{getModules,setModuleEnabled,
 * downgradeDisallowedModules}, but Malapos stores the per-workspace
 * state on PosSettings (one row per accountId) rather than an Account
 * model.
 *
 * Modules are PARTNER INTEGRATIONS only:
 *   payment      → Plugipay  (per-merchant payment workspace)
 *   fulfillment  → Fulkruma  (per-merchant fulfillment workspace)
 *   marketing    → Ripllo    (per-merchant marketing workspace)
 *
 * First enable provisions the partner workspace and records its id on
 * PosSettings; disable flips the flag only and KEEPS the workspace
 * (so historical data survives, the merchant just can't use the
 * surface until they re-enable). The deep per-module feature surfaces
 * (QRIS-at-sell, delivery UI, loyalty proxy) are built separately and
 * gate on these flags via the require*Client factories.
 */
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { MODULE_KEYS, modulesAllowedForTier, type ModuleKey, type BillingTier } from '../lib/billing.js';
import {
  provisionPaymentWorkspace,
  ensureMerchantWebhookEndpoint,
  plugipayForMerchant,
} from './plugipay-module-service.js';
import { provisionFulfillmentWorkspace } from './fulkruma-module-service.js';
import { provisionMarketingWorkspace } from './ripllo-module-service.js';

export interface ModulesState {
  payment?: boolean;
  fulfillment?: boolean;
  marketing?: boolean;
  /** Unknown/legacy keys are preserved on write + ignored everywhere else. */
  [key: string]: boolean | undefined;
}

function asModulesState(value: unknown): ModulesState {
  return (value as ModulesState | null | undefined) ?? {};
}

/** Find-or-create the PosSettings row for a workspace. PosSettings is
 *  one row per accountId; a row must exist before a module is enabled
 *  (and before partner ids can be stored). */
async function ensurePosSettings(accountId: string) {
  const existing = await prisma.posSettings.findUnique({ where: { accountId } });
  if (existing) return existing;
  return prisma.posSettings.create({
    data: { id: newId('pos'), accountId },
  });
}

export async function getModules(accountId: string): Promise<ModulesState> {
  const row = await prisma.posSettings.findUnique({
    where: { accountId },
    select: { modulesEnabled: true },
  });
  return asModulesState(row?.modulesEnabled);
}

/**
 * Toggle a partner module. On FIRST enable of a module the matching
 * partner workspace is provisioned (idempotent on the partner side)
 * and its id stored. Disable flips the flag only — workspace kept.
 * Returns the new state + the (possibly newly minted) partner ids.
 */
export async function setModuleEnabled(
  accountId: string,
  module: ModuleKey,
  enabled: boolean,
): Promise<{
  modules: ModulesState;
  plugipayMerchantAccountId: string | null;
  fulkrumaAccountId: string | null;
  ripploAccountId: string | null;
}> {
  const settings = await ensurePosSettings(accountId);
  const current = asModulesState(settings.modulesEnabled);
  const next: ModulesState = { ...current, [module]: enabled };

  const brandName = settings.businessName ?? accountId;
  // Partners validate businessEmail as an email when present — malapos has
  // no merchant email on PosSettings, so pass undefined (the partner
  // provisionWorkspace treats it as optional) rather than '' (which fails
  // the partner's email validation and blocks the whole enable).
  const businessEmail: string | undefined = undefined;

  let plugipayMerchantAccountId = settings.plugipayMerchantAccountId;
  let plugipayWebhookSecret = settings.plugipayWebhookSecret;
  let fulkrumaAccountId = settings.fulkrumaAccountId;
  let ripploAccountId = settings.ripploAccountId;

  // First-enable provisioning. Each partner workspace is minted once
  // and reused thereafter (the partner /admin/workspaces endpoint is
  // itself idempotent on accountId).
  if (module === 'payment' && enabled) {
    if (!plugipayMerchantAccountId) {
      plugipayMerchantAccountId = await provisionPaymentWorkspace({
        malaposAccountId: accountId,
        brandName,
        businessEmail,
      });
    }
    // Register the inbound webhook on the merchant's workspace so QRIS
    // checkout completions settle the parked sale. BEST-EFFORT — the
    // helper swallows its own failures and returns the prior secret, so a
    // Plugipay hiccup never blocks enabling the module (QRIS still works
    // via the poll path; re-registration happens on a later enable).
    plugipayWebhookSecret = await ensureMerchantWebhookEndpoint(
      plugipayForMerchant(plugipayMerchantAccountId),
      plugipayWebhookSecret,
    );
  }
  if (module === 'fulfillment' && enabled && !fulkrumaAccountId) {
    fulkrumaAccountId = await provisionFulfillmentWorkspace({
      malaposAccountId: accountId,
      brandName,
      businessEmail,
    });
  }
  if (module === 'marketing' && enabled && !ripploAccountId) {
    ripploAccountId = await provisionMarketingWorkspace({
      malaposAccountId: accountId,
      brandName,
      businessEmail,
    });
  }

  await prisma.posSettings.update({
    where: { accountId },
    data: {
      modulesEnabled: next,
      ...(plugipayMerchantAccountId ? { plugipayMerchantAccountId } : {}),
      ...(plugipayWebhookSecret ? { plugipayWebhookSecret } : {}),
      ...(fulkrumaAccountId ? { fulkrumaAccountId } : {}),
      ...(ripploAccountId ? { ripploAccountId } : {}),
    },
  });

  return {
    modules: next,
    plugipayMerchantAccountId: plugipayMerchantAccountId ?? null,
    fulkrumaAccountId: fulkrumaAccountId ?? null,
    ripploAccountId: ripploAccountId ?? null,
  };
}

/**
 * Soft-downgrade: after a plan change, silently disable any enabled
 * module the new tier doesn't allow. The partner workspace stays alive
 * (historical data survives); the merchant just can't use the surface
 * until they re-upgrade. Unknown/legacy keys are preserved untouched.
 */
export async function downgradeDisallowedModules(
  accountId: string,
  newTier: BillingTier,
): Promise<ModulesState> {
  const row = await prisma.posSettings.findUnique({
    where: { accountId },
    select: { modulesEnabled: true },
  });
  if (!row) return {};
  const allowed = new Set(modulesAllowedForTier(newTier) as readonly string[]);
  const current = asModulesState(row.modulesEnabled);
  const isModuleKey = (key: string) => (MODULE_KEYS as readonly string[]).includes(key);

  const next: ModulesState = {};
  let changed = false;
  for (const [key, on] of Object.entries(current)) {
    if (on && isModuleKey(key) && !allowed.has(key)) {
      next[key] = false;
      changed = true;
    } else {
      next[key] = on;
    }
  }
  if (changed) {
    await prisma.posSettings.update({
      where: { accountId },
      data: { modulesEnabled: next },
    });
    console.log(`[modules] soft-downgrade: ${accountId} → ${newTier}, disabled:`,
      Object.keys(current).filter((k) => current[k] && isModuleKey(k) && !allowed.has(k)));
  }
  return next;
}
