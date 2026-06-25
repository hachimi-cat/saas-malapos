import { Router } from 'express';
import { sendOk, sendList, sendErr } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handleFulkrumaError } from '../../services/fulkruma-proxy.js';

/*
 * /api/v1/fulfillment/deliveries — digital deliveries (Fulkruma). malapos
 * port of storlaunch's routes/storefront/deliveries.ts, but a pure proxy
 * to the gated per-merchant Fulkruma client (storlaunch read a native
 * DigitalDelivery table; malapos has none, so Fulkruma is the authority).
 * requireAuth at the mount.
 */

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const { deliveries } = await client.deliveries.list();
      return sendList(res, req, deliveries, null, false);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const { delivery } = await client.deliveries.get(String(req.params.id));
      return sendOk(res, req, delivery);
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 404) return sendErr(res, req, 404, 'NOT_FOUND', 'Delivery not found');
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

export default router;
