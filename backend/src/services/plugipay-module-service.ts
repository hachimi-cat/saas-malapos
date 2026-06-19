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
  businessEmail?: string;
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
    ...(opts.businessEmail ? { businessEmail: opts.businessEmail } : {}),
  });
  return ws.accountId;
}

const MALAPOS_PUBLIC_URL = () => process.env.MALAPOS_PUBLIC_URL ?? 'https://malapos.com';

/**
 * Register (idempotently) a WebhookEndpoint on the MERCHANT's Plugipay
 * workspace pointing at Malapos's webhook route, so dynamic-QRIS checkout
 * completions for that merchant's sales reach us. The endpoint secret is
 * returned ONCE at create — we persist it on
 * PosSettings.plugipayWebhookSecret; the inbound webhook route verifies
 * merchant-order events with it (env PLUGIPAY_WEBHOOK_SECRET only covers
 * Malapos's OWN billing workspace endpoint). Mirrors serront's
 * ensureSellerWebhookEndpoint.
 *
 * Returns the (possibly newly minted) secret, or null on any failure —
 * the caller treats registration as BEST-EFFORT so a Plugipay hiccup
 * never blocks enabling the module (QRIS still works via the poll path;
 * the webhook can be re-registered on a later enable).
 */
export async function ensureMerchantWebhookEndpoint(
  client: PlugipayClient,
  currentSecret: string | null,
): Promise<string | null> {
  const url = `${MALAPOS_PUBLIC_URL()}/api/v1/webhooks/plugipay`;
  try {
    const existing = await client.webhookEndpoints.list();
    const ours = existing.find((e) => e.url === url && e.active);
    if (ours) {
      if (currentSecret) return currentSecret;
      // Endpoint exists but we never captured its secret (a previous
      // enable crashed between create and persist). Re-mint: delete +
      // create so the stored secret matches what Plugipay signs with.
      await client.webhookEndpoints.delete(ours.id);
    }
    const created = await client.webhookEndpoints.create({
      url,
      events: ['plugipay.checkout_session.completed.v1'],
      description: 'Malapos — QRIS sale settlement',
    });
    return created.secret ?? currentSecret;
  } catch (err) {
    console.error('[plugipay-module] webhook endpoint registration failed (non-fatal):', {
      message: (err as Error).message,
    });
    return currentSecret;
  }
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

/**
 * Non-throwing module probe — mirrors marketingClientIfEnabled. Returns
 * the per-merchant Plugipay client when the Payments module is on AND the
 * platform PLUGIPAY_* env is configured, else `null`. Used by the
 * gift-card facade (and the sell/refund flows through it) so the
 * Plugipay-backed gift-card path is taken only when the module is on;
 * otherwise the caller falls back to the LOCAL implementation unchanged.
 * Never throws: a missing merchant workspace or a misconfigured platform
 * key must not break a counter sale or a build with no Plugipay env
 * (local dev / tests / CI) — the probe simply returns null → local path.
 */
export async function paymentClientIfEnabled(
  accountId: string,
): Promise<PlugipayClient | null> {
  try {
    const row = await prisma.posSettings.findUnique({
      where: { accountId },
      select: { plugipayMerchantAccountId: true, modulesEnabled: true },
    });
    const modules = (row?.modulesEnabled as { payment?: boolean } | null) ?? {};
    if (modules.payment !== true || !row?.plugipayMerchantAccountId) return null;
    if (!process.env.PLUGIPAY_KEY_ID || !process.env.PLUGIPAY_SECRET) return null;
    return plugipayForMerchant(row.plugipayMerchantAccountId);
  } catch {
    return null;
  }
}
