import { Router } from 'express';
import { z } from 'zod';
import { sendOk, sendList, sendCreated, sendErr } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handleFulkrumaError } from '../../services/fulkruma-proxy.js';

/*
 * /api/v1/fulfillment/warehouses — Fulkruma warehouse CRUD. malapos port
 * of the warehouse routes from storlaunch's routes/inventory.ts. Pure
 * proxy to the gated per-merchant Fulkruma client; malapos keeps no local
 * warehouse rows. These are the FULFILLMENT (Fulkruma) warehouses, NOT
 * malapos's own POS inventory at /api/v1/inventory. requireAuth at mount.
 */

const router = Router();

const warehouseSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  postal: z.string().max(20).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  isDefault: z.boolean().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const { warehouses } = await client.warehouses.list();
      return sendList(res, req, warehouses, null, false);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    let body: z.infer<typeof warehouseSchema>;
    try {
      body = warehouseSchema.parse(req.body);
    } catch {
      return sendErr(res, req, 400, 'VALIDATION_ERROR', 'Invalid warehouse payload');
    }
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const { warehouse } = await client.warehouses.create({
        name: body.name,
        address: body.address ?? undefined,
        city: body.city ?? undefined,
        postal: body.postal ?? undefined,
        phone: body.phone ?? undefined,
        isDefault: body.isDefault ?? undefined,
      });
      return sendCreated(res, req, warehouse);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res, next) => {
    let body: z.infer<typeof warehouseSchema>;
    try {
      body = warehouseSchema.partial().parse(req.body) as z.infer<typeof warehouseSchema>;
    } catch {
      return sendErr(res, req, 400, 'VALIDATION_ERROR', 'Invalid warehouse payload');
    }
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const { warehouse } = await client.warehouses.update(String(req.params.id), {
        name: body.name ?? undefined,
        address: body.address ?? undefined,
        city: body.city ?? undefined,
        postal: body.postal ?? undefined,
        phone: body.phone ?? undefined,
        isDefault: body.isDefault ?? undefined,
      });
      return sendOk(res, req, warehouse);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      await client.warehouses.archive(String(req.params.id));
      return sendOk(res, req, { archived: true });
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

export default router;
