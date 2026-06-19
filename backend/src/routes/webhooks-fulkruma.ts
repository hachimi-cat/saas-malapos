import { Router } from 'express';
import { verifyWebhook } from '@forjio/fulkruma-node';
import { prisma } from '../lib/db.js';
import { sendOk, sendErr } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';

/*
 * POST /api/v1/webhooks/fulkruma — inbound Fulkruma (Biteship) events.
 *
 * Fulkruma's outbox worker POSTs shipment status updates so a Malapos
 * sale that was dispatched for delivery mirrors the Biteship driver
 * lifecycle (confirmed → picking_up → dropping_off → delivered) without
 * polling. Signature-verified inside the handler (no auth middleware) —
 * the raw body is captured by app.ts's express.json `verify` hook
 * (req.rawBody), exactly like routes/webhooks-plugipay.ts.
 *
 * Fulkruma signs HMAC-SHA256 over `${timestamp}.${rawBody}` and sends
 * `Fulkruma-Signature: t=<unix>,v1=<hex>`; verification is delegated to
 * the SDK's `verifyWebhook`.
 *
 * Env: FULKRUMA_WEBHOOK_SECRET — the shared secret for the webhook
 * endpoint registered with Fulkruma for this Malapos deploy. DISTINCT
 * from FULKRUMA_KEY_ID/FULKRUMA_SECRET (the platform API key) and from
 * PLUGIPAY_WEBHOOK_SECRET.
 */

const router = Router();

interface FulkrumaShipmentStatusData {
  shipmentId?: string;
  status?: string;
  [key: string]: unknown;
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const secret = process.env.FULKRUMA_WEBHOOK_SECRET;
    if (!secret) {
      return sendErr(res, req, 401, 'NOT_CONFIGURED', 'FULKRUMA_WEBHOOK_SECRET not configured');
    }
    if (!req.rawBody) {
      return sendErr(res, req, 400, 'VALIDATION_ERROR', 'missing request body');
    }

    const sigHeader = req.headers['fulkruma-signature'];
    const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

    let event: { id: string; type: string; data: FulkrumaShipmentStatusData };
    try {
      event = verifyWebhook<FulkrumaShipmentStatusData>({
        rawBody: req.rawBody,
        signature: sig ?? null,
        secret,
      }) as typeof event;
    } catch (err) {
      console.error('[fulkruma-webhook] signature verification failed:', (err as Error).message);
      return sendErr(res, req, 401, 'INVALID_SIGNATURE', 'webhook signature did not match');
    }

    console.log(`[fulkruma-webhook] ${event.type} id=${event.id}`);

    try {
      if (event.type === 'fulkruma.shipment.status_updated.v1') {
        await handleShipmentStatusUpdated(event.data);
      }
      // Other event types (pickup_confirmed, …) are logged above and
      // ignored — Malapos initiates those, so there's nothing to mirror.
    } catch (err) {
      console.error(`[fulkruma-webhook] handler failed for ${event.type}`, err);
      // Still ack 200 — rely on Fulkruma retries + our idempotency
      // rather than have the same event hammered.
    }

    return sendOk(res, req, { received: true });
  }),
);

/**
 * Mirror a Fulkruma/Biteship shipment status onto the originating
 * Transaction. Append-only-ish: we never regress a delivered sale back
 * to an earlier state if events arrive out of order.
 */
async function handleShipmentStatusUpdated(data: FulkrumaShipmentStatusData): Promise<void> {
  const shipmentId = typeof data.shipmentId === 'string' ? data.shipmentId : null;
  const status = typeof data.status === 'string' ? data.status : null;
  if (!shipmentId || !status) return;

  const txn = await prisma.transaction.findFirst({
    where: { fulkrumaShipmentId: shipmentId },
    select: { id: true, deliveryStatus: true },
  });
  if (!txn) {
    console.log(`[fulkruma-webhook] no sale for shipment ${shipmentId} — skipping`);
    return;
  }

  if (txn.deliveryStatus === status) return;
  // Don't regress past a terminal state if an earlier event lands late.
  const current = RANK[txn.deliveryStatus ?? ''] ?? -1;
  const next = RANK[status] ?? 0;
  if (next < current) return;

  await prisma.transaction.update({
    where: { id: txn.id },
    data: { deliveryStatus: status },
  });
  console.log(`[fulkruma-webhook] ${txn.id} delivery ${txn.deliveryStatus ?? '∅'} → ${status}`);
}

// Lifecycle ordering for the no-regress guard. Cancelled/returned/failed
// are terminal and rank high so a late in-transit event can't overwrite
// them.
const RANK: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  allocated: 2,
  picking_up: 3,
  picked_up: 4,
  dropping_off: 5,
  in_transit: 5,
  delivered: 6,
  cancelled: 7,
  returned: 7,
  failed: 7,
};

export default router;
