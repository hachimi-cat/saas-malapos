import { Router } from 'express';
import { z } from 'zod';
import { sendOk, sendList, sendCreated, sendErr } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handleFulkrumaError } from '../../services/fulkruma-proxy.js';

/*
 * /api/v1/fulfillment/licenses — software license keys (Fulkruma). malapos
 * port of storlaunch's routes/storefront/licenses.ts. Pure proxy to the
 * gated per-merchant Fulkruma client; malapos keeps no local License rows.
 * requireAuth at the mount.
 */

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const { licenses } = await client.licenses.list();
      return sendList(res, req, licenses, null, false);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

router.get(
  '/validate',
  asyncHandler(async (req, res, next) => {
    try {
      const key = req.query.key ? String(req.query.key) : undefined;
      if (!key) return sendErr(res, req, 400, 'VALIDATION_ERROR', 'key query parameter is required');
      const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const result = await client.licenses.validate({ key, ...(productId ? { productId } : {}) });
      return sendOk(res, req, result);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

const issueSchema = z.object({
  productId: z.string().min(1),
  customerId: z.string().min(1),
  maxActivations: z.number().int().min(1).optional(),
  expiresAt: z.string().optional(),
});

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    let body: z.infer<typeof issueSchema>;
    try {
      body = issueSchema.parse(req.body);
    } catch {
      return sendErr(res, req, 400, 'VALIDATION_ERROR', 'productId + customerId are required');
    }
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const { license } = await client.licenses.issue({
        productId: body.productId,
        customerId: body.customerId,
        maxActivations: body.maxActivations,
        expiresAt: body.expiresAt,
        externalSource: 'malapos',
      });
      return sendCreated(res, req, license);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

router.post(
  '/:id/revoke',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const { license } = await client.licenses.revoke(String(req.params.id));
      return sendOk(res, req, license);
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 404) return sendErr(res, req, 404, 'NOT_FOUND', 'License not found');
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

export default router;
