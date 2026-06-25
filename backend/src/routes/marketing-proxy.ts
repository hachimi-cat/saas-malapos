/*
 * Catch-all Marketing (Ripllo) proxy — mounted at
 * `/api/v1/account/marketing/*`. The merchant portal mirrors Ripllo's
 * full marketing UI (campaigns, contracts, programs, inbox, audience,
 * channels, compose, funnels, creators directory, …). Rather than
 * typing one Express route per endpoint, this generic proxy forwards
 * verbatim to Ripllo via the platform SDK's `passthrough`, scoped to the
 * merchant through `requireRipploClient` (which also enforces the
 * Marketing-module gate → 409 MARKETING_MODULE_DISABLED).
 *
 *   GET  /api/v1/account/marketing/campaigns        → ripllo GET  /api/v1/campaigns
 *   POST /api/v1/account/marketing/funnels/:id/steps → ripllo PUT  /api/v1/funnels/:id/steps
 *   …etc.
 *
 * The query string is preserved; Ripllo's already-unwrapped `data` is
 * re-wrapped in the Malapos envelope. requireAuth is applied at the
 * mount in routes/index.ts. Express 4 wildcard form (`*`); storlaunch's
 * `/*splat` is the Express 5 spelling. Inside this mounted router
 * `req.path` is the tail below `/account/marketing`.
 *
 * This namespace (`/account/marketing/*`) is disjoint from the typed
 * native routes (`/marketing/*` for discount-codes + POS-native loyalty,
 * `/account/{blog,feeds,pixels,abandoned-cart}`), so there is no route
 * collision — the native loyalty + discount flows are untouched.
 */
import { Router } from 'express';
import { sendOk } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { requireRipploClient, handleRipploError } from '../services/ripllo-proxy.js';

const router = Router();

router.all(
  '*',
  asyncHandler(async (req, res, next) => {
    try {
      const accountId = req.auth!.accountId as string;
      const client = await requireRipploClient(accountId);
      const tailPath = req.path.replace(/^\/+/, '');
      const queryString = req.originalUrl.split('?')[1] ?? '';
      const ripploPath = `/api/v1/${tailPath}${queryString ? `?${queryString}` : ''}`;
      const method = req.method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      const hasBody =
        method !== 'GET' &&
        method !== 'DELETE' &&
        req.body &&
        Object.keys(req.body).length > 0;
      const data = await client.passthrough(method, ripploPath, hasBody ? req.body : undefined);
      return sendOk(res, req, data);
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

export default router;
