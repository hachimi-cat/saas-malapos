/*
 * Malapos × Ripllo (Marketing) module glue. Mirrors the Fulkruma
 * module service. One platform-scoped Ripllo client is shared across
 * merchants; per-merchant calls go through `.forMerchant(ripploAccountId)`.
 * The per-merchant id is minted at first
 * `setModuleEnabled('marketing', true)` and stored on
 * PosSettings.ripploAccountId.
 *
 * Env (set on the Malapos deploy):
 *   RIPLLO_KEY_ID          platform-admin API key id
 *   RIPLLO_SECRET          platform-admin API key secret
 *   RIPLLO_BASE_URL        default https://ripllo.com
 *   RIPLLO_DISCOUNT_RATE   flat rate stamped at provision time,
 *                          e.g. 0.003 (0.3%). Frozen per merchant.
 */
import { RiplloClient } from '@forjio/ripllo-node';
import { prisma } from '../lib/db.js';

const RIPLLO_BASE_URL = process.env.RIPLLO_BASE_URL ?? 'https://ripllo.com';
const RIPLLO_DISCOUNT_RATE = Number.parseFloat(
  process.env.RIPLLO_DISCOUNT_RATE ?? '0.003',
);

// Lazy — missing env throws a clean runtime error inside the enable
// flow, never at import/build time.
let platformClient: RiplloClient | null = null;
export function getMarketingPlatformClient(): RiplloClient {
  if (!platformClient) {
    const keyId = process.env.RIPLLO_KEY_ID;
    const secret = process.env.RIPLLO_SECRET;
    if (!keyId || !secret) {
      throw new Error('RIPLLO_KEY_ID + RIPLLO_SECRET env vars required to use the Marketing module');
    }
    platformClient = new RiplloClient({ keyId, secret, baseUrl: RIPLLO_BASE_URL });
  }
  return platformClient;
}

export function ripploForMerchant(ripploAccountId: string): RiplloClient {
  return getMarketingPlatformClient().forMerchant(ripploAccountId);
}

/** Provision (or look up) a Ripllo workspace for a Malapos workspace.
 *  Idempotent — re-calling returns the existing workspace. */
export async function provisionMarketingWorkspace(opts: {
  malaposAccountId: string;
  brandName: string;
  businessEmail: string;
}): Promise<string> {
  const client = getMarketingPlatformClient();
  const ws = await client.admin.provisionWorkspace({
    accountId: opts.malaposAccountId,
    partner: 'malapos',
    discountRate: RIPLLO_DISCOUNT_RATE,
    brandName: opts.brandName,
    businessEmail: opts.businessEmail,
  });
  return ws.accountId;
}

/** Gated client factory — throws `marketing_module_disabled` (status
 *  409) when the module isn't on for this merchant. */
export async function requireMarketingClient(accountId: string): Promise<RiplloClient> {
  const row = await prisma.posSettings.findUnique({
    where: { accountId },
    select: { ripploAccountId: true, modulesEnabled: true },
  });
  const modules = (row?.modulesEnabled as { marketing?: boolean } | null) ?? {};
  if (modules.marketing !== true || !row?.ripploAccountId) {
    const err = new Error('Marketing module is not enabled for this account');
    (err as Error & { code?: string; status?: number }).code = 'marketing_module_disabled';
    (err as Error & { code?: string; status?: number }).status = 409;
    throw err;
  }
  return ripploForMerchant(row.ripploAccountId);
}
