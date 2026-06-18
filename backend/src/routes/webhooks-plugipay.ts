import { Router } from 'express';
import { verifyWebhook, PlugipayError } from '@forjio/plugipay-node';
import { prisma } from '../lib/db.js';
import { sendOk, sendErr } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { applyCheckoutCompleted, parseCheckoutMetadata } from '../lib/billing.js';

/*
 * POST /api/v1/webhooks/plugipay — inbound Plugipay events.
 *
 * Plugipay signs HMAC-SHA256 over `${timestamp}.${rawBody}` and sends
 * `X-Plugipay-Signature: t=<ts>,v1=<hex>`; we delegate verification to
 * the SDK's `verifyWebhook`. The raw body is captured by app.ts's
 * express.json `verify` hook — verifying the re-serialized parsed body
 * would break on whitespace differences.
 *
 * Malapos bills only its OWN tiers (no per-seller reseller flow), so a
 * single secret (env PLUGIPAY_WEBHOOK_SECRET) verifies every event and
 * the only handled type is the tier checkout
 * (plugipay.checkout_session.completed.v1 with {accountId, tier}
 * metadata). The handler is idempotent on the checkout-session id and
 * always acks 200 (rely on Plugipay retries + our idempotency rather
 * than risk an event being hammered).
 */

const router = Router();

interface VerifiedEvent {
  id: string;
  type: string;
  data: { object: { id: string; metadata?: Record<string, unknown> | null } };
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

    const sigHeader = req.headers['x-plugipay-signature'];
    const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

    let event: VerifiedEvent;
    try {
      event = verifyWebhook(req.rawBody, sig, secret) as unknown as VerifiedEvent;
    } catch (err) {
      if (err instanceof PlugipayError) {
        return sendErr(res, req, err.status, err.code, err.message);
      }
      return sendErr(res, req, 401, 'INVALID_SIGNATURE', 'webhook signature did not match');
    }

    console.log(`[plugipay-webhook] ${event.type} id=${event.id}`);

    try {
      if (event.type === 'plugipay.checkout_session.completed.v1') {
        const session = event.data.object;
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
          console.warn(
            `[plugipay-webhook] completed session ${session.id} without malapos tier metadata — ignoring`,
          );
        }
      }
      // Other events (expired, invoice.*, …) are logged above and
      // ignored — v1 subscriptions renew via fresh checkouts.
    } catch (err) {
      console.error(`[plugipay-webhook] handler failed for ${event.type}`, err);
      // Still ack 200 — Plugipay retry semantics + our idempotency
      // mean we'd rather investigate from logs than have the same
      // event hammered until something breaks.
    }

    sendOk(res, req, { received: true });
  }),
);

export default router;
