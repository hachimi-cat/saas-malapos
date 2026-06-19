import { Router } from 'express';
import { verifyWebhook, PlugipayError } from '@forjio/plugipay-node';
import { prisma } from '../lib/db.js';
import { sendOk, sendErr } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { applyCheckoutCompleted, parseCheckoutMetadata } from '../lib/billing.js';
import { applyOrderPaymentCompleted, parseOrderCheckoutMetadata } from '../lib/order-payment.js';

/*
 * POST /api/v1/webhooks/plugipay — inbound Plugipay events.
 *
 * Plugipay signs HMAC-SHA256 over `${timestamp}.${rawBody}` and sends
 * `X-Plugipay-Signature: t=<ts>,v1=<hex>`; we delegate verification to
 * the SDK's `verifyWebhook`. The raw body is captured by app.ts's
 * express.json `verify` hook — verifying the re-serialized parsed body
 * would break on whitespace differences.
 *
 * TWO webhook sources land here since the Payment module shipped (the
 * serront two-secret pattern):
 *
 *  1. Malapos's OWN tier-billing workspace endpoint — secret = env
 *     PLUGIPAY_WEBHOOK_SECRET. Events: tier checkouts with metadata
 *     {accountId, tier}. Settled by lib/billing.ts applyCheckoutCompleted.
 *
 *  2. Per-MERCHANT Plugipay workspaces — one endpoint per provisioned
 *     payment workspace, registered at Payment-module enable; each has
 *     its OWN secret stored on PosSettings.plugipayWebhookSecret.
 *     Events: dynamic-QRIS order checkouts with metadata
 *     {saleAccountId, saleId}. Settled by lib/order-payment.ts
 *     applyOrderPaymentCompleted (Payment → PAID + Transaction → COMPLETED).
 *
 * Verification (`verifyAgainstKnownSecrets`) tries the env secret first,
 * then resolves the merchant's secret via the (unverified) envelope's
 * accountId → PosSettings.plugipayMerchantAccountId →
 * plugipayWebhookSecret. The signature check is still what authenticates;
 * the parse is only used to FIND the candidate secret.
 *
 * Both branches are idempotent (billing: checkout-session id guard;
 * orders: PARKED-sale guard — an already-settled sale is a no-op) and
 * the handler always acks 200 (Plugipay retries + our idempotency).
 */

const router = Router();

interface VerifiedEvent {
  id: string;
  type: string;
  accountId?: string;
  data: { object: { id: string; metadata?: Record<string, unknown> | null } };
}

/** Two-secret verification (serront's `verifyAgainstKnownSecrets`): the
 *  env billing secret first, then the per-merchant secret resolved by the
 *  unverified envelope's accountId (the Plugipay workspace id) →
 *  PosSettings.plugipayMerchantAccountId → plugipayWebhookSecret. */
async function verifyAgainstKnownSecrets(
  rawBody: string,
  signature: string | string[] | undefined,
  envSecret: string,
): Promise<VerifiedEvent | null> {
  const sig = Array.isArray(signature) ? signature[0] : signature;
  try {
    return verifyWebhook(rawBody, sig, envSecret) as unknown as VerifiedEvent;
  } catch {
    /* fall through to the per-merchant secret */
  }
  // Find the merchant whose Plugipay workspace emitted this event. The
  // envelope's accountId is the Plugipay workspace id (acc_* on the
  // PLUGIPAY side) — unverified here, used only as a lookup key.
  let workspaceId: string | undefined;
  try {
    workspaceId = (JSON.parse(rawBody) as { accountId?: string }).accountId;
  } catch {
    return null;
  }
  if (!workspaceId) return null;
  const merchant = await prisma.posSettings.findFirst({
    where: { plugipayMerchantAccountId: workspaceId },
    select: { plugipayWebhookSecret: true },
  });
  if (!merchant?.plugipayWebhookSecret) return null;
  try {
    return verifyWebhook(rawBody, sig, merchant.plugipayWebhookSecret) as unknown as VerifiedEvent;
  } catch {
    return null;
  }
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const secret = process.env.PLUGIPAY_WEBHOOK_SECRET;
    if (!secret) {
      return sendErr(res, req, 401, 'NOT_CONFIGURED', 'PLUGIPAY_WEBHOOK_SECRET not configured');
    }
    if (!req.rawBody) {
      return sendErr(res, req, 400, 'VALIDATION_ERROR', 'missing request body');
    }

    let event: VerifiedEvent | null;
    try {
      event = await verifyAgainstKnownSecrets(
        req.rawBody,
        req.headers['x-plugipay-signature'],
        secret,
      );
    } catch (err) {
      if (err instanceof PlugipayError) {
        return sendErr(res, req, err.status, err.code, err.message);
      }
      event = null;
    }
    if (!event) {
      return sendErr(res, req, 401, 'INVALID_SIGNATURE', 'webhook signature did not match any known secret');
    }

    console.log(`[plugipay-webhook] ${event.type} id=${event.id}`);

    try {
      if (event.type === 'plugipay.checkout_session.completed.v1') {
        const session = event.data.object;

        // Branch 1 — Malapos's OWN tier billing ({accountId, tier}).
        const billing = parseCheckoutMetadata(session.metadata);
        if (billing) {
          const outcome = await applyCheckoutCompleted(prisma, {
            sessionId: session.id,
            accountId: billing.accountId,
            tier: billing.tier,
          });
          if (outcome === 'duplicate') {
            console.log(`[plugipay-webhook] session ${session.id} already applied — skipping`);
          }
        } else {
          // Branch 2 — merchant dynamic-QRIS order ({saleAccountId, saleId}),
          // stamped by routes/payments.ts POST /payments/qris. Settles the
          // parked sale (Payment → PAID + Transaction → COMPLETED).
          const orderMeta = parseOrderCheckoutMetadata(session.metadata);
          if (orderMeta) {
            const { outcome } = await applyOrderPaymentCompleted({
              sessionId: session.id,
              accountId: orderMeta.accountId,
              saleId: orderMeta.saleId,
            });
            if (outcome === 'not_found') {
              console.warn(`[plugipay-webhook] completed session ${session.id} names unknown sale ${orderMeta.saleId} — ignoring`);
            } else if (outcome === 'duplicate') {
              console.log(`[plugipay-webhook] sale ${orderMeta.saleId} already settled — skipping`);
            }
          } else {
            console.warn(
              `[plugipay-webhook] completed session ${session.id} without malapos metadata — ignoring`,
            );
          }
        }
      }
      // Other events (expired, invoice.*, …) are logged above and
      // ignored — v1 subscriptions renew via fresh checkouts.
    } catch (err) {
      console.error(`[plugipay-webhook] handler failed for ${event.type}`, err);
      // Still ack 200 — Plugipay retry semantics + our idempotency mean
      // we'd rather investigate from logs than have the same event
      // hammered until something breaks.
    }

    sendOk(res, req, { received: true });
  }),
);

export default router;
