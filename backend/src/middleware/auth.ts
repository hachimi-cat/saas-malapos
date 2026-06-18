import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AuthError, type ForjioClaims } from '@forjio/sdk/auth';
import { resolveSessionForRequest, parseCookie } from '@forjio/sdk/auth-server';
import { authConfig } from '../auth-config.js';
import { sendErr } from '../lib/http.js';
import { prisma } from '../lib/db.js';
import { API_KEY_PREFIX, hashApiKey } from '../lib/api-keys.js';

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
      scope: '',
      iss: issuer,
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 900,
      iat: Math.floor(Date.now() / 1000),
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
