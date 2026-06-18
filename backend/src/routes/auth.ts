import { createAuthRouter } from '@forjio/sdk/auth-server';
import { authConfig } from '../auth-config.js';

/*
 * Auth router — cookie-first Huudis SSO via the shared
 * @forjio/sdk/auth-server BFF kit. Mounted at /api/v1/auth.
 *
 * Routes (exactly the paths @forjio/auth-ui's forms POST to):
 *   POST /login                     email + password (Huudis ROPC)
 *   POST /signup                    email + password + name
 *   POST /password-reset/request    proxy to Huudis
 *   POST /password-reset/complete   proxy to Huudis
 *   GET  /huudis/start              social/redirect OIDC start (PKCE)
 *   GET  /huudis/callback           OIDC code exchange → session cookie
 *   GET  /me                        resolve current session
 *   POST /logout                    clear the cookie
 *
 * Product-specific config (cookie name, client id, scope, accountId
 * derivation, roles, sign-in gate) lives in ../auth-config.ts.
 *
 * FORKERS: set HUUDIS_CLIENT_ID + HUUDIS_CLIENT_SECRET in backend/.env
 * (scripts/bootstrap.mjs registers the OIDC client and writes them).
 */
export default createAuthRouter(authConfig);
