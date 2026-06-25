import { Router } from 'express';
import { z } from 'zod';
import { sendOk, sendList, sendErr } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handleFulkrumaError } from '../../services/fulkruma-proxy.js';

/*
 * /api/v1/fulfillment/inventory — Fulkruma warehouse inventory. malapos
 * port of the stock routes from storlaunch's routes/inventory.ts.
 *
 * Unlike storlaunch (which owns Product/ProductVariant locally and mirrors
 * them to Fulkruma), malapos keeps its OWN POS catalogue + stock at
 * /api/v1/inventory and /api/v1/products. THIS surface is the separate
 * Fulkruma-side warehouse inventory: the Fulkruma products/variants and
 * their per-warehouse stock levels, movements, and adjustments. Pure proxy
 * over the gated per-merchant Fulkruma client. requireAuth at the mount.
 */

const router = Router();

// Fulkruma-side products (with their variants) — the inventory grid lists
// a row per variant/warehouse pair from these.
router.get(
  '/products',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const { products } = await client.products.list();
      return sendList(res, req, products, null, false);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

router.get(
  '/stock',
  asyncHandler(async (req, res, next) => {
    try {
      const variantId = req.query.variantId ? String(req.query.variantId) : undefined;
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const { stock } = await client.stock.levels(variantId ? { variant_id: variantId } : {});
      return sendList(res, req, stock, null, false);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

router.get(
  '/movements',
  asyncHandler(async (req, res, next) => {
    try {
      const variantId = req.query.variantId ? String(req.query.variantId) : undefined;
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const { movements } = await client.stock.movements(variantId ? { variant_id: variantId } : {});
      return sendList(res, req, movements, null, false);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

const adjustSchema = z.object({
  variantId: z.string().min(1),
  warehouseId: z.string().min(1),
  delta: z.number().int(),
  reason: z.enum([
    'manual_adjust',
    'refund_restock',
    'transfer_in',
    'transfer_out',
    'damaged',
    'returned_to_supplier',
    'initial_stock',
    'import',
  ]),
  note: z.string().max(500).optional(),
});

router.post(
  '/adjust',
  asyncHandler(async (req, res, next) => {
    let body: z.infer<typeof adjustSchema>;
    try {
      body = adjustSchema.parse(req.body);
    } catch {
      return sendErr(res, req, 400, 'VALIDATION_ERROR', 'Invalid stock adjustment payload');
    }
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const result = await client.stock.adjust({
        variantId: body.variantId,
        warehouseId: body.warehouseId,
        delta: body.delta,
        reason: body.reason,
        note: body.note,
      });
      return sendOk(res, req, result);
    } catch (err) {
      const e = err as Error & { code?: string; message?: string };
      if (e.code === 'NEGATIVE_STOCK' || e.message?.includes('NEGATIVE_STOCK')) {
        return sendErr(res, req, 409, 'INSUFFICIENT_STOCK', 'Insufficient stock');
      }
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

export default router;
