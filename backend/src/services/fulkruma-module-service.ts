/*
 * Malapos × Fulkruma (Fulfillment) module glue. Mirrors the
 * Plugipay module service. One platform-scoped Fulkruma client is
 * shared across merchants; per-merchant calls go through
 * `.forMerchant(fulkrumaAccountId)`. The per-merchant id is minted at
 * first `setModuleEnabled('fulfillment', true)` and stored on
 * PosSettings.fulkrumaAccountId.
 *
 * Env (set on the Malapos deploy — DISTINCT from the Plugipay key):
 *   FULKRUMA_KEY_ID          platform-admin API key id
 *   FULKRUMA_SECRET          platform-admin API key secret
 *   FULKRUMA_BASE_URL        default https://fulkruma.com
 *   FULKRUMA_DISCOUNT_RATE   flat rate stamped at provision time,
 *                            e.g. 0.005 (0.5%). Frozen per merchant.
 */
import { FulkrumaClient } from '@forjio/fulkruma-node';
import { prisma } from '../lib/db.js';

const FULKRUMA_BASE_URL = process.env.FULKRUMA_BASE_URL ?? 'https://fulkruma.com';
const FULKRUMA_DISCOUNT_RATE = Number.parseFloat(
  process.env.FULKRUMA_DISCOUNT_RATE ?? '0.005',
);

// Lazy — missing env throws a clean runtime error inside the enable
// flow, never at import/build time.
let platformClient: FulkrumaClient | null = null;
export function getFulfillmentPlatformClient(): FulkrumaClient {
  if (!platformClient) {
    const keyId = process.env.FULKRUMA_KEY_ID;
    const secret = process.env.FULKRUMA_SECRET;
    if (!keyId || !secret) {
      throw new Error('FULKRUMA_KEY_ID + FULKRUMA_SECRET env vars required to use the Fulfillment module');
    }
    platformClient = new FulkrumaClient({ keyId, secret, baseUrl: FULKRUMA_BASE_URL });
  }
  return platformClient;
}

export function fulkrumaForMerchant(fulkrumaAccountId: string): FulkrumaClient {
  return getFulfillmentPlatformClient().forMerchant(fulkrumaAccountId);
}

/** Provision (or look up) a Fulkruma workspace for a Malapos
 *  workspace. Idempotent — re-calling returns the same workspace. */
export async function provisionFulfillmentWorkspace(opts: {
  malaposAccountId: string;
  brandName: string;
  businessEmail?: string;
}): Promise<string> {
  const client = getFulfillmentPlatformClient();
  const ws = await client.admin.provisionWorkspace({
    accountId: opts.malaposAccountId,
    partner: 'malapos',
    discountRate: FULKRUMA_DISCOUNT_RATE,
    brandName: opts.brandName,
    ...(opts.businessEmail ? { businessEmail: opts.businessEmail } : {}),
  });
  return ws.accountId;
}

/** Gated client factory — throws `fulfillment_module_disabled` (status
 *  409) when the module isn't on for this merchant. */
export async function requireFulfillmentClient(accountId: string): Promise<FulkrumaClient> {
  const row = await prisma.posSettings.findUnique({
    where: { accountId },
    select: { fulkrumaAccountId: true, modulesEnabled: true },
  });
  const modules = (row?.modulesEnabled as { fulfillment?: boolean } | null) ?? {};
  if (modules.fulfillment !== true || !row?.fulkrumaAccountId) {
    const err = new Error('Fulfillment module is not enabled for this account');
    (err as Error & { code?: string; status?: number }).code = 'fulfillment_module_disabled';
    (err as Error & { code?: string; status?: number }).status = 409;
    throw err;
  }
  return fulkrumaForMerchant(row.fulkrumaAccountId);
}
