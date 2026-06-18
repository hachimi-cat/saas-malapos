import { createHuudisProxy } from '@forjio/sdk/auth-server';
import { authConfig } from '../auth-config.js';

/*
 * Huudis IAM proxy — mounted at /api/v1/huudis. A thin `createHuudisProxy`
 * over the shared @forjio/sdk/auth-server kit: it forwards whitelisted
 * /account/* + /iam/* calls to Huudis on behalf of the signed-in user
 * with the server-side token, refreshing on a 401.
 *
 * This is how a stateless Forjio product does account + workspace
 * management — the frontend (or @forjio/portal-ui) calls
 * /api/v1/huudis/account (profile, password, delete),
 * /api/v1/huudis/account/workspaces (create/rename/switch) and
 * /api/v1/huudis/iam/users (members) straight through. There is no
 * local mirror: Huudis stays the single source of truth for identity.
 *
 * A DB-backed product (one that mirrors workspaces into its own tables)
 * pushes through this same proxy first, then mirrors on success — see
 * the storlaunch / linksnap `services/huudis-push.ts` pattern.
 */
export default createHuudisProxy(authConfig);
