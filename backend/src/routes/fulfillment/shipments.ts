import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { sendOk, sendList, sendCreated, sendErr } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handleFulkrumaError } from '../../services/fulkruma-proxy.js';

/*
 * /api/v1/fulfillment/shipments — physical shipment surface (Fulkruma →
 * Biteship). malapos port of storlaunch's routes/shipping.ts shipment
 * routes, implemented over the gated per-merchant Fulkruma client.
 *
 * This is the dashboard "Shipments" view (list / detail / book courier /
 * label / cancel). The POS sell-screen create-from-sale flow keeps using
 * the existing /api/v1/delivery surface (routes/delivery.ts), which also
 * stamps the originating Transaction; this router does NOT collide with
 * it. requireAuth is applied at the mount in routes/index.ts.
 */

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const status = req.query.status ? String(req.query.status) : undefined;
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const { shipments } = await client.shipments.list(status ? { status } : {});
      return sendList(res, req, shipments, null, false);
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
      const { shipment } = await client.shipments.get(String(req.params.id));
      return sendOk(res, req, shipment);
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 404) return sendErr(res, req, 404, 'NOT_FOUND', 'Shipment not found');
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

router.get(
  '/:id/label',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const { shipment } = await client.shipments.get(String(req.params.id));
      if (!shipment.labelUrl) {
        return sendErr(res, req, 404, 'LABEL_NOT_AVAILABLE', 'Shipment label not yet generated');
      }
      return sendOk(res, req, { url: shipment.labelUrl });
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

const createSchema = z.object({
  transactionId: z.string().optional(),
  customerId: z.string().optional(),
  customerEmail: z.string().email().optional(),
  courierCode: z.string().min(1),
  courierServiceCode: z.string().min(1),
  courierType: z.string().optional(),
  price: z.number().int().min(0).optional(),
  insured: z.boolean().optional(),
  insurance: z.number().int().min(0).optional(),
  destination: z.record(z.unknown()),
  items: z.array(z.record(z.unknown())).min(1),
});

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const accountId = req.auth!.accountId as string;
    let body: z.infer<typeof createSchema>;
    try {
      body = createSchema.parse(req.body);
    } catch {
      return sendErr(res, req, 400, 'VALIDATION_ERROR', 'Invalid shipment payload');
    }

    // If a transactionId is supplied it must be a real sale in this
    // workspace — guards against stamping a foreign / nonexistent sale.
    let txn: { id: string } | null = null;
    if (body.transactionId) {
      txn = await prisma.transaction.findFirst({
        where: { id: body.transactionId, accountId },
        select: { id: true },
      });
      if (!txn) {
        return sendErr(res, req, 404, 'NOT_FOUND', 'Sale not found in this workspace', {
          param: 'transactionId',
        });
      }
    }

    try {
      const client = await requireMerchantClient(accountId);
      const { shipment } = await client.shipments.create({
        customerId: body.customerId,
        customerEmail: body.customerEmail,
        courierCode: body.courierCode,
        courierServiceCode: body.courierServiceCode,
        courierType: body.courierType ?? 'regular',
        price: typeof body.price === 'number' ? body.price : 0,
        insured: body.insured ?? false,
        insurance: body.insurance,
        // Empty origin — Fulkruma fills it from the merchant's saved
        // shipping origin (the same pattern storlaunch + delivery.ts use).
        origin: {},
        destination: body.destination,
        items: body.items,
        externalSource: 'malapos',
        externalRef: txn?.id,
      });

      if (txn) {
        await prisma.transaction.update({
          where: { id: txn.id },
          data: { fulkrumaShipmentId: shipment.id, deliveryStatus: shipment.status },
        });
      }

      return sendCreated(res, req, shipment);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

router.post(
  '/:id/confirm-pickup',
  asyncHandler(async (req, res, next) => {
    try {
      const accountId = req.auth!.accountId as string;
      const client = await requireMerchantClient(accountId);
      const { shipment } = await client.shipments.confirmPickup(String(req.params.id));
      await prisma.transaction.updateMany({
        where: { accountId, fulkrumaShipmentId: shipment.id },
        data: { deliveryStatus: shipment.status },
      });
      return sendOk(res, req, shipment);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

router.post(
  '/:id/cancel',
  asyncHandler(async (req, res, next) => {
    try {
      const accountId = req.auth!.accountId as string;
      const reason =
        typeof req.body?.reason === 'string' ? req.body.reason : 'Merchant cancelled';
      const client = await requireMerchantClient(accountId);
      const { shipment } = await client.shipments.cancel(String(req.params.id), reason);
      await prisma.transaction.updateMany({
        where: { accountId, fulkrumaShipmentId: shipment.id },
        data: { deliveryStatus: shipment.status },
      });
      return sendOk(res, req, shipment);
    } catch (err) {
      return handleFulkrumaError(res, req, err, next);
    }
  }),
);

export default router;
