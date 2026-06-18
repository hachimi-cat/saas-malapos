import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { resolveSessionForRequest } from '@forjio/sdk/auth-server';
import { sendErr } from '../lib/http.js';
import { authConfig } from '../auth-config.js';

/**
 * Guard for this product's admin surfaces — every route mounted under
 * `/api/v1/admin` on the backend.
 *
 * Accepts EITHER of two credentials, so a single set of routes serves
 * both the in-product admin portal and any first-party automation:
 *
 *   1. An `admin`-role BFF session cookie (`malapos_admin_session`).
 *      This is the in-product admin portal — the frontend admin data
 *      proxy at `/api/v1/console/*` forwards the cookie + the role
 *      header (`X-Forjio-Brand-Role: admin`), which the shared
 *      auth-server kit resolves. The auth config's `gate` already
 *      restricted the cookie to owner/admin members of this product's
 *      Huudis workspace at sign-in (the `workspace_role` claim), so a
 *      present `admin` session is by definition an authorised admin.
 *
 *   2. The `X-Forjio-Admin-Secret` header matching the env var
 *      `MALAPOS_ADMIN_SECRET`. This is the server-to-server path:
 *      first-party tooling (the Forjio platform, a cron, an ops
 *      script) that has no browser session calls these endpoints with
 *      the shared secret.
 *
 * On success it stamps `req.auth` (so handlers can read a reviewerId)
 * and continues; otherwise 401.
 *
 * FORKERS: `scripts/rename.sh` rewrites the `malapos` slug and the
 * `MALAPOS` env-var prefix. The admin portal ships as a shell —
 * mount your product's admin routers behind this guard under
 * `/api/v1/admin` in `routes/index.ts`.
 */

const issuer = process.env.HUUDIS_ISSUER ?? 'https://huudis.com';
const audience =
  process.env.HUUDIS_AUDIENCE ?? process.env.FORJIO_SERVICE ?? 'malapos';

/** Constant-time compare of the inbound admin secret header. */
function secretMatches(req: Request): boolean {
  const expected = process.env.MALAPOS_ADMIN_SECRET;
  const got = req.headers['x-forjio-admin-secret'];
  if (!expected || typeof got !== 'string' || !got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function adminGuard(req: Request, res: Response, next: NextFunction) {
  // Path A — in-product admin portal: a resolved `admin`-role session.
  const session = resolveSessionForRequest(authConfig, req);
  if (session && session.role === 'admin') {
    req.auth = {
      sub: session.huudisSub,
      accountId: session.accountId,
      scope: '',
      iss: issuer,
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 900,
      iat: Math.floor(Date.now() / 1000),
      role: 'admin',
    } as unknown as Request['auth'];
    return next();
  }

  // Path B — server-to-server: the shared admin secret.
  if (secretMatches(req)) {
    return next();
  }

  return sendErr(res, req, 401, 'AUTH_REQUIRED', 'admin session or secret required');
}
