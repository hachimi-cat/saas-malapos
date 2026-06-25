import { Router } from 'express';
import { sendOk, sendErr } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handleFulkrumaError } from '../../services/fulkruma-proxy.js';

/*
 * /api/v1/fulfillment/shipping — pure proxy to Fulkruma for the shipping
 * origin, courier catalog, and rate quotes. malapos port of storlaunch's
 * routes/shipping.ts (origin/couriers/rates). Fulkruma owns the Biteship
 * integration; malapos writes no shipping-origin columns locally.
 *
 * Coexists with /api/v1/delivery (routes/delivery.ts), which exposes the
 * same origin/couriers/rates for the POS sell flow; this surface backs
 * the dashboard "Shipping" settings page. requireAuth at the mount.
 */

const router = Router();

router.get(
  '/origin',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const origin = await client.shipping.origin();
      return sendOk(res, req, origin);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

router.patch(
  '/origin',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const origin = await client.shipping.setOrigin((req.body ?? {}) as Record<string, unknown>);
      return sendOk(res, req, origin);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

router.get(
  '/couriers',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const couriers = await client.shipping.couriers();
      return sendOk(res, req, couriers);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

router.post(
  '/rates',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const rates = await client.shipping.rates(
        (req.body ?? {}) as {
          destination: Record<string, unknown>;
          items: Array<Record<string, unknown>>;
          insurance?: boolean;
        },
      );
      return sendOk(res, req, rates);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

// Public buyer tracking lives on fulkruma.com — keep the route present so
// the chrome never 404s, but redirect callers to the canonical tracker.
router.get('/track/:waybillId', (req, res) => {
  return sendErr(res, req, 410, 'MOVED', 'Tracking has moved to fulkruma.com/track/:waybillId');
});

export default router;
