/*
 * Malapos × Plugipay (Payments) module glue. Mirrors storlaunch's
 * plugipay-module-service, adapted to Malapos conventions (PosSettings
 * holds the per-merchant state, not an Account model).
 *
 * IMPORTANT: this REUSES Malapos's existing platform Plugipay key
 * (PLUGIPAY_KEY_ID / PLUGIPAY_SECRET — the same key lib/plugipay.ts
 * uses for Malapos's OWN tier billing). The merchant's own payment
 * stack lives in a SEPARATE per-merchant Plugipay workspace, minted at
 * first `payment` enable and stored on
 * PosSettings.plugipayMerchantAccountId. Calls scoped to a merchant go
 * through `.forMerchant(plugipayMerchantAccountId)`.
 *
 * Env (already set on the Malapos deploy for billing):
 *   PLUGIPAY_KEY_ID          platform-admin API key id
 *   PLUGIPAY_SECRET          platform-admin API key secret
 *   PLUGIPAY_BASE_URL        default https://plugipay.com
 *   PLUGIPAY_DISCOUNT_RATE   flat rate stamped at provision time,
 *                            e.g. 0.003 (0.3%). Frozen per merchant.
 */
import { PlugipayClient } from '@forjio/plugipay-node';
import { prisma } from '../lib/db.js';

const PLUGIPAY_BASE_URL = process.env.PLUGIPAY_BASE_URL ?? 'https://plugipay.com';
const PLUGIPAY_DISCOUNT_RATE = Number.parseFloat(
  process.env.PLUGIPAY_DISCOUNT_RATE ?? '0.003',
);

// Lazy platform client. Constructed on first use so a missing env var
// throws a clean RUNTIME error inside the enable flow — never at
// import/build time (the partner keys aren't set in the local env).
let platformClient: PlugipayClient | null = null;
export function getPaymentPlatformClient(): PlugipayClient {
  if (!platformClient) {
    const keyId = process.env.PLUGIPAY_KEY_ID;
    const secret = process.env.PLUGIPAY_SECRET;
    if (!keyId || !secret) {
      throw new Error('PLUGIPAY_KEY_ID + PLUGIPAY_SECRET env vars required to use the Payments module');
    }
    platformClient = new PlugipayClient({ keyId, secret, baseUrl: PLUGIPAY_BASE_URL });
  }
  return platformClient;
}

export function plugipayForMerchant(plugipayMerchantAccountId: string): PlugipayClient {
  return getPaymentPlatformClient().forMerchant(plugipayMerchantAccountId);
}

/**
 * Provision (or look up) a per-MERCHANT Plugipay workspace for a
 * Malapos workspace. Idempotent on the Plugipay side — re-calling
 * returns the same workspace. Returns the minted plugipay accountId.
 */
export async function provisionPaymentWorkspace(opts: {
  malaposAccountId: string;
  brandName: string;
  businessEmail: string;
}): Promise<string> {
  const client = getPaymentPlatformClient();
  const ws = await client.admin.provisionWorkspace({
    accountId: opts.malaposAccountId,
    // The installed plugipay-node (0.6.x) narrows `partner` to the
    // products it shipped knowing about; Malapos is a newer partner the
    // server already accepts. Cast keeps the build green until the SDK
    // type widens.
    partner: 'malapos' as 'storlaunch' | 'fulkruma' | 'ripllo',
    discountRate: PLUGIPAY_DISCOUNT_RATE,
    brandName: opts.brandName,
    businessEmail: opts.businessEmail,
  });
  return ws.accountId;
}

/**
 * Gated client factory — throws `payment_module_disabled` (status 409)
 * when the merchant hasn't enabled the Payments module. Malapos routes
 * proxying to Plugipay use this.
 */
export async function requirePaymentClient(accountId: string): Promise<PlugipayClient> {
  const row = await prisma.posSettings.findUnique({
    where: { accountId },
    select: { plugipayMerchantAccountId: true, modulesEnabled: true },
  });
  if (!row) {
    const err = new Error('Payment module is not enabled for this account');
    (err as Error & { code?: string; status?: number }).code = 'payment_module_disabled';
    (err as Error & { code?: string; status?: number }).status = 409;
    throw err;
  }
  const modules = (row.modulesEnabled as { payment?: boolean } | null) ?? {};
  if (modules.payment !== true || !row.plugipayMerchantAccountId) {
    const err = new Error('Payment module is not enabled for this account');
    (err as Error & { code?: string; status?: number }).code = 'payment_module_disabled';
    (err as Error & { code?: string; status?: number }).status = 409;
    throw err;
  }
  return plugipayForMerchant(row.plugipayMerchantAccountId);
}
