import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AuthError, type ForjioClaims } from '@forjio/sdk/auth';
import { resolveSessionForRequest, parseCookie } from '@forjio/sdk/auth-server';
import { authConfig } from '../auth-config.js';
import { sendErr } from '../lib/http.js';
import { prisma } from '../lib/db.js';
import { API_KEY_PREFIX, hashApiKey } from '../lib/api-keys.js';
import {
  DELEGATION_DENIED_PATHS as EMBED_DENIED_PATHS,
  getDelegationSecret,
  verifyDelegationToken,
} from '@forjio/catentio-embed';
import { MALAPOS_DELEGATION_PREFIX } from '../lib/catentio-profile.js';

/**
 * Allowlist-first: an embedded agent run may reach these prefixes and
 * NOTHING else. Being here grants READ (gather) — writes additionally
 * need DELEGATION_WRITABLE_PATHS below. `approvalRequired` resources
 * (money and stock movers) sit here and NOT on the writable list: the
 * agent must be able to find the sale to refund or the level that is
 * low, but the Apply always runs under the merchant's own session.
 * Denying reads was the flaw in the first cut of the proposal model —
 * an agent told to propose a refund but forbidden from reading any sale
 * has been given a job it cannot start.
 */
const DELEGATION_ALLOWED_PATHS = [
  // Local POS resources
  '/api/v1/categories',
  '/api/v1/products',
  '/api/v1/modifiers',
  '/api/v1/outlets',
  '/api/v1/tables',
  '/api/v1/floors',
  '/api/v1/suppliers',
  '/api/v1/customers',
  '/api/v1/settings',
  '/api/v1/webhook-subscriptions',
  // Read-only gather surfaces: the books. Off the writable list, so a
  // delegated run can answer "what sold today / what is low" but can
  // never record, void or adjust anything.
  '/api/v1/reports',
  '/api/v1/inventory',
  '/api/v1/sales',
  '/api/v1/shifts',
  '/api/v1/gift-cards',
  '/api/v1/purchase-orders',
  // Marketing module (Ripllo)
  '/api/v1/marketing',
  '/api/v1/account/marketing',
  '/api/v1/account/blog/posts',
  '/api/v1/account/feeds',
  '/api/v1/account/pixels',
  '/api/v1/account/abandoned-cart',
  '/api/v1/account/referrals',
  // Payments module (Plugipay)
  '/api/v1/payments/plans',
  '/api/v1/payments/checkout-sessions',
  '/api/v1/payments/subscriptions',
  '/api/v1/payments/customers',
  '/api/v1/payments/invoices',
  '/api/v1/payments/receipts',
  '/api/v1/payments/payouts',
  // Fulfillment module (Fulkruma)
  '/api/v1/delivery',
  '/api/v1/fulfillment',
];

/**
 * Denied BEFORE the allowlist is consulted, so a future allowlist entry
 * can never re-open one of them — the same deny-beats-allow ordering
 * that makes the runtime's native-tool deny work. The package's floor
 * is INHERITED rather than copied, so a later addition there lands here
 * for free. /payments/plugipay-settings holds the payment-provider
 * configuration passthrough (the plugipay /adapters equivalent) and is
 * the single most important entry.
 */
const DELEGATION_DENIED_PATHS = [
  ...EMBED_DENIED_PATHS,
  '/api/v1/payments/plugipay-settings',
  '/api/v1/payments/ledger',
  '/api/v1/payments/reports',
  '/api/v1/payments/qris',
  '/api/v1/account/marketing-media',
  '/api/v1/kds',
  '/api/v1/events',
  '/api/v1/uploads',
  '/api/v1/audit-log',
  '/api/v1/modules',
  '/api/v1/admin',
  '/api/v1/huudis',
];

/**
 * Non-GET is allowed ONLY under these prefixes — the direct-write
 * resources: things the merchant CONFIGURES. Money in motion, stock
 * movements and anything deciding what someone pays (refunds, gift
 * cards, adjustments, PO receiving, plans/prices, checkout sessions,
 * subscriptions, payouts, shipments, discount codes, loyalty/referral
 * rates) is deliberately absent: those are `approvalRequired` resources
 * whose Apply runs under the merchant's own session. Enforced here
 * rather than left to the token's write bit, so even an auto-apply
 * workspace cannot have its agent write a sale or move stock.
 *
 * /api/v1/settings is writable but the transfer bank details it carries
 * are NOT — where the merchant's money lands is stripped from delegated
 * writes in routes/settings.ts, the same way plugipay strips payment-
 * method routing from its delegated checkout-settings path.
 *
 * /api/v1/delivery/rates is a POST but computes a courier quote — the
 * gather step of a shipment proposal — and mutates nothing.
 */
const DELEGATION_WRITABLE_PATHS = [
  '/api/v1/categories',
  '/api/v1/products',
  '/api/v1/modifiers',
  '/api/v1/outlets',
  '/api/v1/tables',
  '/api/v1/floors',
  '/api/v1/suppliers',
  '/api/v1/customers',
  '/api/v1/settings',
  '/api/v1/webhook-subscriptions',
  '/api/v1/account/blog/posts',
  '/api/v1/account/feeds',
  '/api/v1/account/pixels',
  '/api/v1/account/abandoned-cart',
  '/api/v1/account/marketing/marketing-campaigns',
  '/api/v1/account/marketing/funnels',
  '/api/v1/delivery/origin',
  '/api/v1/delivery/rates',
  '/api/v1/fulfillment/warehouses',
  '/api/v1/payments/customers',
];

declare module 'express-serve-static-core' {
  interface Request {
    auth?: ForjioClaims;
  }
}

const issuer = process.env.HUUDIS_ISSUER ?? 'https://huudis.com';
const audience = process.env.HUUDIS_AUDIENCE ?? process.env.FORJIO_SERVICE ?? 'malapos';

/** Product-route auth. Three paths:
 *
 *  Path 0 — browser session cookie (the BFF path, fulkruma pattern):
 *  the backend is the Huudis OAuth client; resolve the merchant-role
 *  session minted by routes/auth.ts. Portal fetches ride this.
 *
 *  Path 1 — `Authorization: Bearer sk_live_…` API key, hashed and
 *  matched against the unique `keyHash` column (lib/api-keys.ts).
 *
 *  Path 2 — `Authorization: Bearer <jwt>` verified via @forjio/sdk
 *  (API callers).
 *
 *  Attaches claims to `req.auth`; rejects with a standard envelope. */

/** Live Huudis membership check — only hit on the stale-session path
 *  (override cookie not in the login-time accountIds snapshot). */
async function liveWorkspaceIds(accessToken: string): Promise<Set<string> | null> {
  try {
    const res = await fetch(`${issuer}/api/v1/account/workspaces`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    return new Set((body.data ?? []).map((w) => w.id).filter((x): x is string => !!x));
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Path 0 — BFF session cookie.
  const bffSession = resolveSessionForRequest(authConfig, req);
  if (bffSession && bffSession.role !== 'admin') {
    // Workspace switcher override (fulkruma pattern): honor the
    // `malapos_active_workspace` cookie (set by @forjio/portal-ui's
    // switcher, `${brandSlug}_active_workspace`) when it names a
    // workspace the session is actually a member of, else the derived
    // personal id.
    const override = parseCookie(req.headers.cookie, 'malapos_active_workspace');
    const allowed = new Set([bffSession.accountId, ...(bffSession.accountIds ?? [])]);
    let accountId = override && allowed.has(override) ? override : bffSession.accountId;
    if (override && !allowed.has(override) && bffSession.huudisAccessToken) {
      // STALE-SESSION CLASS (serront round 4): accountIds are
      // snapshotted at LOGIN, so a workspace created after sign-in is
      // in the switcher (live list) but not the session — snapshot-only
      // checks silently serve the WRONG workspace (empty data, free
      // tier). Re-check live membership once before falling back;
      // fail-closed to the default on non-membership, timeout, or
      // fetch error.
      const live = await liveWorkspaceIds(bffSession.huudisAccessToken);
      if (live?.has(override)) accountId = override;
    }
    req.auth = {
      sub: bffSession.huudisSub,
      accountId,
      // email/name ride along for the catentio flag allowlist (which
      // matches on either the usr_ id or the address) and for display.
      email: bffSession.email,
      name: bffSession.name,
      scope: '',
      iss: issuer,
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 900,
      iat: Math.floor(Date.now() / 1000),
    } as unknown as ForjioClaims;
    return next();
  }

  // Path 3 — catentio delegation (`Authorization: Delegation <token>`):
  // an embedded agent run acting for a signed-in member (see
  // routes/catentio.ts; token minted there via @forjio/catentio-embed).
  // Checked before the Bearer requirement below because a delegation
  // header is not a Bearer header.
  //
  // Review mode mints the token WITHOUT the write bit, and refusing
  // non-GET here is what makes the review step un-promptable: the agent
  // cannot talk its way past an auth layer that never reads what it said.
  const delegationHeader = req.headers.authorization;
  if (delegationHeader?.startsWith('Delegation ')) {
    // requireAuth runs inside mounted routers, where req.path alone is
    // router-relative — match on baseUrl+path or every rule is a no-op.
    const fullPath = `${req.baseUrl || ''}${req.path || ''}`;
    const denied = DELEGATION_DENIED_PATHS.some(
      (pth) => fullPath === pth || fullPath.startsWith(`${pth}/`),
    );
    const allowed =
      !denied &&
      DELEGATION_ALLOWED_PATHS.some((pth) => fullPath === pth || fullPath.startsWith(`${pth}/`));
    if (!allowed) {
      return sendErr(res, req, 403, 'FORBIDDEN', 'This resource is not available to delegated agents');
    }
    // Reads and writes are separate grants: a path on the allowlist but
    // off the writable list is exactly read-only, whatever the token's
    // write bit says. This is the auth half of `approvalRequired` — the
    // agent gathers here, proposes on a card, and the merchant's own
    // session applies.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const writable = DELEGATION_WRITABLE_PATHS.some(
        (pth) => fullPath === pth || fullPath.startsWith(`${pth}/`),
      );
      if (!writable) {
        return sendErr(
          res,
          req,
          403,
          'FORBIDDEN',
          'This assistant proposes changes here for your approval — it cannot write directly',
        );
      }
    }
    let delegationSecret: string;
    try {
      delegationSecret = getDelegationSecret();
    } catch {
      return sendErr(res, req, 401, 'INVALID_TOKEN', 'Invalid or expired delegation token');
    }
    const claims = verifyDelegationToken(
      delegationHeader.slice('Delegation '.length),
      delegationSecret,
      { prefix: MALAPOS_DELEGATION_PREFIX },
    );
    if (!claims) {
      return sendErr(res, req, 401, 'INVALID_TOKEN', 'Invalid or expired delegation token');
    }
    if (!claims.writes && req.method !== 'GET' && req.method !== 'HEAD') {
      return sendErr(
        res,
        req,
        403,
        'FORBIDDEN',
        'This assistant proposes changes for your approval — it cannot write directly',
      );
    }
    req.auth = {
      sub: claims.sub,
      accountId: claims.workspaceId,
      email: claims.email,
      name: claims.name,
      scope: '',
      iss: issuer,
      aud: audience,
      exp: claims.exp,
      iat: claims.iat,
    } as unknown as ForjioClaims;
    return next();
  }

  const token = req.headers.authorization?.replace(/^Bearer /i, '');
  if (!token) {
    return sendErr(res, req, 401, 'AUTH_REQUIRED', 'Missing Authorization header');
  }

  // Path 1 — API key (`Authorization: Bearer sk_live_…`). Checked on
  // the `sk_` prefix BEFORE JWT verification: keys are opaque random
  // strings, not JWTs, and would always fail verifyAccessToken.
  if (token.startsWith('sk_')) {
    if (!token.startsWith(API_KEY_PREFIX)) {
      return sendErr(res, req, 401, 'INVALID_TOKEN', 'Unknown API key format');
    }
    const row = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(token) } });
    if (!row) {
      return sendErr(res, req, 401, 'INVALID_TOKEN', 'Invalid API key');
    }
    req.auth = {
      sub: `api_key:${row.id}`,
      accountId: row.accountId,
      scope: '',
      iss: issuer,
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 900,
      iat: Math.floor(Date.now() / 1000),
    } as unknown as ForjioClaims;
    // Fire-and-forget freshness marker — never blocks the request.
    void prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch((e) => console.error('[auth] lastUsedAt update failed', e));
    return next();
  }

  // Path 2 — Huudis-issued Bearer JWT.
  try {
    req.auth = await verifyAccessToken(token, { issuer, audience });
    next();
  } catch (e) {
    const authErr = e instanceof AuthError ? e : new AuthError('INVALID_TOKEN', 'verification failed');
    return sendErr(res, req, 401, authErr.code, authErr.message);
  }
}
