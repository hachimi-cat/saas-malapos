import crypto from 'node:crypto';
import {
  createHuudisOidc,
  createSessionCodec,
  type AuthServerConfig,
} from '@forjio/sdk/auth-server';

/*
 * BFF auth config — this product's binding of the shared
 * @forjio/sdk/auth-server kit (the IETF browser-based-apps BCP
 * pattern: the backend is the confidential OAuth client, Huudis tokens
 * stay server-side, the browser only ever holds an httpOnly session
 * cookie).
 *
 * Stateless Huudis BFF: identity lives entirely in Huudis, there is no
 * local user table, and the accountId is derived from the Huudis sub.
 *
 * Two roles ship from the template:
 *
 *   - `merchant` — the default. Multi-tenant, open: any Huudis account
 *     can open its own portal. This is the product's main surface.
 *   - `admin`    — the built-in admin portal. The lone GATED role: it
 *     is restricted to owner/admin members of THIS product's own Huudis
 *     workspace (the `workspace_role` OIDC claim). The admin portal
 *     ships as a shell + dashboard; per-product admin pages are added
 *     later under `frontend/src/app/(admin)/admin/(portal)/`.
 *
 * A product that needs more roles adds entries to `roles`; one that
 * needs a single-user gate tightens `gate`.
 *
 * FORKERS: `scripts/rename.sh` rewrites the `malapos` slug. Set
 * HUUDIS_CLIENT_ID + HUUDIS_CLIENT_SECRET in backend/.env
 * (scripts/bootstrap.mjs registers the OIDC client and writes them).
 * Manage admins by managing this product's Huudis workspace membership
 * — there is no per-product admin allowlist.
 */

const CLIENT_ID = process.env.HUUDIS_CLIENT_ID ?? 'malapos';

/** Stable per-user account id — hashing the Huudis sub keeps it opaque
 *  and fixed-width; the same user always resolves to the same acc_*. */
function deriveAccountId(huudisSub: string): string {
  return `acc_${crypto.createHash('sha256').update(huudisSub).digest('hex').slice(0, 24)}`;
}

export const authConfig: AuthServerConfig = {
  oidc: createHuudisOidc({
    issuer: process.env.HUUDIS_ISSUER ?? 'https://huudis.com',
    clientId: CLIENT_ID,
    clientSecret: process.env.HUUDIS_CLIENT_SECRET ?? '',
    scope: `openid profile email ${CLIENT_ID}:admin`,
  }),
  codec: createSessionCodec({
    secret:
      process.env.SESSION_SIGNING_SECRET ??
      process.env.HUUDIS_CLIENT_SECRET ??
      'dev-only-fallback-session-secret',
  }),
  roles: {
    merchant: {
      cookie: 'malapos_session',
      accountId: deriveAccountId,
      returnTo: '/dashboard',
      loginPath: '/login',
    },
    admin: {
      cookie: 'malapos_admin_session',
      // adm_<sub> — keeps the admin accountId in its own namespace,
      // distinct from the merchant `acc_*` derivation, so admin and
      // merchant data never collide for the same Huudis identity.
      accountId: (sub) => `adm_${sub}`,
      returnTo: '/admin/dashboard',
      loginPath: '/admin/login',
    },
  },
  // Sign-in gate — scoped to the `admin` role ONLY. `merchant` returns
  // true unconditionally (open, multi-tenant portal). The admin portal
  // is restricted to owner/admin members of THIS product's own Huudis
  // workspace: Huudis emits the user's role in the product's OIDC
  // client workspace as the `workspace_role` claim. Manage admins by
  // managing workspace membership in Huudis — no per-product allowlist.
  //
  // A non-admin who signs in at /admin/login is rejected at
  // session-mint time, so the admin cookie can only ever belong to an
  // authorised admin.
  gate: (_sub, role, ctx) =>
    role !== 'admin' ||
    ctx?.claims?.workspace_role === 'owner' ||
    ctx?.claims?.workspace_role === 'admin',
  stateCookie: 'malapos_oidc_state',
  stateSecret:
    process.env.OIDC_SIGNING_SECRET ??
    process.env.HUUDIS_CLIENT_SECRET ??
    'dev-only-fallback-oidc-secret',
  roleHeader: 'x-malapos-role',
  allowIdpHint: true,
};
