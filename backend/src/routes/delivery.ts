import { Router } from 'express';
import { FulkrumaError } from '@forjio/fulkruma-node';
import { prisma } from '../lib/db.js';
import { sendOk, sendList, sendErr } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireFulfillmentClient } from '../services/fulkruma-module-service.js';

/*
 * /api/v1/delivery — Fulfillment (Fulkruma → Biteship) surface for the
 * Malapos delivery module. A pure proxy over the gated per-merchant
 * Fulkruma client (services/fulkruma-module-service.requireFulfillmentClient
 * → throws fulfillment_module_disabled/409 when the module is off).
 * Fulkruma owns the shipping origin, courier catalog, rate quotes, and
 * shipment lifecycle; Malapos keeps only the shipment id + last driver
 * status on the originating Transaction so the POS can show delivery
 * progress on a sale.
 *
 * Mirrors saas-storlaunch/backend/src/routes/shipping.ts. Mounted behind
 * requireAuth in routes/index.ts.
 */

const router = Router();

/** Translate a thrown Fulkruma/module error into the Malapos envelope.
 *  The module gate throws a plain Error with code/status; the SDK throws
 *  FulkrumaError. Everything else bubbles to the express error handler. */
function sendFulkrumaErr(res: Parameters<typeof sendErr>[0], req: Parameters<typeof sendErr>[1], err: unknown) {
  const e = err as Error & { status?: number; code?: string; name?: string };
  if (e.code === 'fulfillment_module_disabled') {
    return sendErr(res, req, 409, 'FULFILLMENT_MODULE_DISABLED', e.message);
  }
  if (e instanceof FulkrumaError || e.name === 'FulkrumaError') {
    const status = e.status && e.status >= 400 ? e.status : 502;
    return sendErr(res, req, status, e.code || 'FULKRUMA_ERROR', e.message);
  }
  if (e.status && e.code) return sendErr(res, req, e.status, e.code, e.message);
  return sendErr(res, req, 502, 'FULKRUMA_ERROR', e.message || 'Fulfillment request failed');
}

// ── Shipping origin ─────────────────────────────────────────────────
router.get(
  '/origin',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const client = await requireFulfillmentClient(req.auth!.accountId as string);
      const origin = await client.shipping.origin();
      return sendOk(res, req, origin);
    } catch (err) {
      return sendFulkrumaErr(res, req, err);
    }
  }),
);

router.patch(
  '/origin',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const client = await requireFulfillmentClient(req.auth!.accountId as string);
      const origin = await client.shipping.setOrigin((req.body ?? {}) as Record<string, unknown>);
      return sendOk(res, req, origin);
    } catch (err) {
      return sendFulkrumaErr(res, req, err);
    }
  }),
);

// ── Courier catalog ─────────────────────────────────────────────────
router.get(
  '/couriers',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const client = await requireFulfillmentClient(req.auth!.accountId as string);
      const couriers = await client.shipping.couriers();
      return sendOk(res, req, couriers);
    } catch (err) {
      return sendFulkrumaErr(res, req, err);
    }
  }),
);

// ── Rate quotes ─────────────────────────────────────────────────────
router.post(
  '/rates',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const client = await requireFulfillmentClient(req.auth!.accountId as string);
      const rates = await client.shipping.rates(
        (req.body ?? {}) as {
          destination: Record<string, unknown>;
          items: Array<Record<string, unknown>>;
          insurance?: boolean;
        },
      );
      return sendOk(res, req, rates);
    } catch (err) {
      return sendFulkrumaErr(res, req, err);
    }
  }),
);

// ── Shipments ───────────────────────────────────────────────────────
router.get(
  '/shipments',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const status = req.query.status ? String(req.query.status) : undefined;
      const client = await requireFulfillmentClient(req.auth!.accountId as string);
      const { shipments } = await client.shipments.list(status ? { status } : {});
      return sendList(res, req, shipments, null, false);
    } catch (err) {
      return sendFulkrumaErr(res, req, err);
    }
  }),
);

router.get(
  '/shipments/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const client = await requireFulfillmentClient(req.auth!.accountId as string);
      const { shipment } = await client.shipments.get(String(req.params.id));
      return sendOk(res, req, shipment);
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 404) return sendErr(res, req, 404, 'NOT_FOUND', 'Shipment not found');
      return sendFulkrumaErr(res, req, err);
    }
  }),
);

/**
 * POST /shipments — create a delivery shipment for a sale.
 *
 * Body: { transactionId?, destination, courierCode, courierServiceCode,
 *         courierType?, price, items, insured?, insurance?, customerId?,
 *         customerEmail? }. Origin is left empty so Fulkruma fills it
 * from the merchant's saved shipping origin (BiteshipConfig). On success
 * the shipment id + status are stamped onto the Transaction (when a
 * transactionId is supplied) so the POS can track delivery progress.
 */
router.post(
  '/shipments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = (req.body ?? {}) as {
      transactionId?: string;
      destination?: Record<string, unknown>;
      courierCode?: string;
      courierServiceCode?: string;
      courierType?: string;
      price?: number;
      items?: Array<Record<string, unknown>>;
      insured?: boolean;
      insurance?: number;
      customerId?: string;
      customerEmail?: string;
    };

    if (!body.destination || typeof body.destination !== 'object') {
      return sendErr(res, req, 400, 'VALIDATION_ERROR', 'destination is required', {
        param: 'destination',
      });
    }
    if (!body.courierCode || !body.courierServiceCode) {
      return sendErr(
        res,
        req,
        400,
        'VALIDATION_ERROR',
        'courierCode + courierServiceCode are required',
        { param: 'courierCode' },
      );
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return sendErr(res, req, 400, 'VALIDATION_ERROR', 'items must be a non-empty array', {
        param: 'items',
      });
    }

    // If a transactionId is given, it must be a real sale in this
    // workspace — guards against stamping a foreign / nonexistent sale.
    let txn: { id: string; fulkrumaShipmentId: string | null } | null = null;
    if (body.transactionId) {
      txn = await prisma.transaction.findFirst({
        where: { id: body.transactionId, accountId },
        select: { id: true, fulkrumaShipmentId: true },
      });
      if (!txn) {
        return sendErr(res, req, 404, 'NOT_FOUND', 'Sale not found in this workspace', {
          param: 'transactionId',
        });
      }
    }

    try {
      const client = await requireFulfillmentClient(accountId);

      // Idempotency guard: a delivery sale must mint EXACTLY ONE shipment. If
      // this transaction already carries a Fulkruma shipment (the cashier — or
      // a retried completion hook — re-submitted), return the existing one
      // instead of creating a duplicate. Mirrors the completion-effect guards
      // elsewhere (one paid invoice / one loyalty earn per sale).
      if (txn?.fulkrumaShipmentId) {
        const { shipment } = await client.shipments.get(txn.fulkrumaShipmentId);
        return sendOk(res, req, shipment);
      }

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
        // shipping origin (the same pattern storlaunch uses).
        origin: {},
        destination: body.destination,
        items: body.items,
        externalSource: 'malapos',
        externalRef: txn?.id,
      });

      // Stamp the shipment id + initial status on the originating sale.
      if (txn) {
        await prisma.transaction.update({
          where: { id: txn.id },
          data: { fulkrumaShipmentId: shipment.id, deliveryStatus: shipment.status },
        });
      }

      return sendOk(res, req, shipment, 201);
    } catch (err) {
      return sendFulkrumaErr(res, req, err);
    }
  }),
);

// F-004 equivalent — "Book courier": flip the draft into a real Biteship
// order once the parcel is packed. Driver allocation begins after this.
router.post(
  '/shipments/:id/confirm-pickup',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const client = await requireFulfillmentClient(req.auth!.accountId as string);
      const { shipment } = await client.shipments.confirmPickup(String(req.params.id));
      // Mirror the new status onto the linked sale, if any.
      await prisma.transaction.updateMany({
        where: { accountId: req.auth!.accountId as string, fulkrumaShipmentId: shipment.id },
        data: { deliveryStatus: shipment.status },
      });
      return sendOk(res, req, shipment);
    } catch (err) {
      return sendFulkrumaErr(res, req, err);
    }
  }),
);

router.post(
  '/shipments/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const reason =
        typeof req.body?.reason === 'string' ? req.body.reason : 'Merchant cancelled';
      const client = await requireFulfillmentClient(req.auth!.accountId as string);
      const { shipment } = await client.shipments.cancel(String(req.params.id), reason);
      await prisma.transaction.updateMany({
        where: { accountId: req.auth!.accountId as string, fulkrumaShipmentId: shipment.id },
        data: { deliveryStatus: shipment.status },
      });
      return sendOk(res, req, shipment);
    } catch (err) {
      return sendFulkrumaErr(res, req, err);
    }
  }),
);

/**
 * POST /sales/:id/dispatch — deferred dispatch. Create the Fulkruma shipment
 * for a DELIVERY sale from its persisted `deliveryDraft`, instead of at
 * completion. Lets the operator dispatch from the sale-detail page or the serve
 * board once they're ready. Idempotent on fulkrumaShipmentId (one shipment per
 * sale); 409 if the sale has no dispatchable draft.
 */
router.post(
  '/sales/:id/dispatch',
  requireAuth,
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const id = String(req.params.id);
    const txn = await prisma.transaction.findFirst({
      where: { id, accountId },
      select: { id: true, fulkrumaShipmentId: true, deliveryDraft: true },
    });
    if (!txn) {
      return sendErr(res, req, 404, 'NOT_FOUND', 'Sale not found in this workspace', { param: 'id' });
    }

    try {
      const client = await requireFulfillmentClient(accountId);

      // Idempotency: one shipment per sale — return the existing one on a
      // re-dispatch (double-tap on either surface).
      if (txn.fulkrumaShipmentId) {
        const { shipment } = await client.shipments.get(txn.fulkrumaShipmentId);
        return sendOk(res, req, shipment);
      }

      const draft = txn.deliveryDraft as {
        dest?: {
          contactName?: string;
          contactPhone?: string;
          email?: string;
          address?: string;
          area?: string;
          postalCode?: string;
        };
        customerId?: string | null;
        items?: Array<{ name?: string; qty?: number; weight?: number; value?: number }>;
        rate?: { courierCode?: string; courierServiceCode?: string; price?: number; courierType?: string; serviceType?: string } | null;
      } | null;

      if (!draft?.dest || !draft.rate?.courierCode || !draft.rate?.courierServiceCode) {
        return sendErr(res, req, 409, 'CONFLICT', 'This sale has no dispatchable delivery draft', {
          param: 'deliveryDraft',
        });
      }

      const dest = draft.dest;
      const { shipment } = await client.shipments.create({
        customerId: draft.customerId ?? undefined,
        customerEmail: dest.email || undefined,
        courierCode: draft.rate.courierCode,
        courierServiceCode: draft.rate.courierServiceCode,
        courierType: draft.rate.courierType ?? draft.rate.serviceType ?? 'regular',
        price: typeof draft.rate.price === 'number' ? draft.rate.price : 0,
        insured: false,
        // Empty origin — Fulkruma fills it from the merchant's saved origin.
        origin: {},
        destination: {
          contactName: dest.contactName,
          contactPhone: dest.contactPhone,
          contactEmail: dest.email || undefined,
          address: [dest.address, dest.area].filter(Boolean).join(', '),
          area: dest.area,
          postalCode: dest.postalCode,
        },
        items: (draft.items ?? []).map((it) => ({
          name: it.name || 'Item',
          quantity: it.qty || 1,
          weight: it.weight || 0,
          value: it.value || 0,
        })),
        externalSource: 'malapos',
        externalRef: txn.id,
      });

      await prisma.transaction.update({
        where: { id: txn.id },
        data: { fulkrumaShipmentId: shipment.id, deliveryStatus: shipment.status },
      });

      return sendOk(res, req, shipment, 201);
    } catch (err) {
      return sendFulkrumaErr(res, req, err);
    }
  }),
);

export default router;
