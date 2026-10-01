import crypto from 'node:crypto';
import { MalaposError } from './index.js';

/**
 * Receiving Malapos webhooks. Every delivery is a POST with
 *
 *   Malapos-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 *
 * (plus Malapos-Event-Id, Malapos-Event-Type, Malapos-Delivery-Id and
 * Malapos-Delivery-Attempt) and the envelope { id, type, occurredAt, accountId, data } as
 * its body. Verify the signature over the RAW body (before any JSON parsing) with the
 * subscription's signing secret (`whsec_…`, shown once when the endpoint was added).
 * A delivery that is retried keeps its `id`: use it to drop duplicates.
 */

/** The event catalogue (GET /api/v1/webhook-subscriptions/event-types). */
export type MalaposEventType =
  | 'malapos.sale.completed.v1'
  | 'malapos.sale.voided.v1'
  | 'malapos.sale.refunded.v1'
  | 'malapos.purchase_order.received.v1'
  | 'malapos.kds.advanced.v1'
  | 'malapos.kds.reverted.v1'
  | 'malapos.kds.item_advanced.v1'
  | 'malapos.kds.item_reverted.v1'
  | 'malapos.kds.served.v1'
  | 'malapos.shipping_credit.topped_up.v1'
  | 'malapos.billing.subscribed.v1'
  | 'malapos.billing.canceled.v1'
  | 'malapos.webhook_subscription.disabled.v1';

export interface MalaposWebhookEvent<T = Record<string, unknown>> {
  /** evt_… — the same on every delivery attempt; use it to drop duplicates. */
  id: string;
  type: MalaposEventType | string;
  occurredAt: string;
  accountId: string;
  data: T;
}

/**
 * Verify a delivery and return its event. Throws MalaposError (code `INVALID_SIGNATURE`)
 * when the header is missing or malformed, the timestamp is more than `toleranceSec`
 * (default 300) from now, the signature does not match, or the body is not JSON.
 *
 *   app.post('/hooks/malapos', express.raw({ type: 'application/json' }), (req, res) => {
 *     const event = verifyWebhook({
 *       rawBody: req.body,
 *       signature: req.header('Malapos-Signature'),
 *       secret: process.env.MALAPOS_WEBHOOK_SECRET!,
 *     });
 *     if (event.type === 'malapos.sale.completed.v1') { … }
 *     res.sendStatus(204);
 *   });
 */
export function verifyWebhook<T = Record<string, unknown>>(opts: {
  rawBody: string | Uint8Array;
  signature: string | undefined | null;
  secret: string;
  toleranceSec?: number;
  /** Seconds since the epoch — a clock for tests. */
  now?: number;
}): MalaposWebhookEvent<T> {
  const fail = (message: string): never => {
    throw new MalaposError(400, 'INVALID_SIGNATURE', message);
  };
  if (!opts.signature) fail('missing Malapos-Signature header');
  const parts: Record<string, string> = {};
  for (const segment of String(opts.signature).split(',')) {
    const i = segment.indexOf('=');
    if (i > 0) parts[segment.slice(0, i).trim()] = segment.slice(i + 1).trim();
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1 || !/^\d+$/.test(t)) fail('malformed Malapos-Signature header');
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const drift = Math.abs(now - Number(t));
  if (drift > (opts.toleranceSec ?? 300)) fail(`signature timestamp is ${drift}s from now`);

  const body = typeof opts.rawBody === 'string' ? opts.rawBody : Buffer.from(opts.rawBody).toString('utf8');
  const expected = Buffer.from(crypto.createHmac('sha256', opts.secret).update(`${t}.${body}`).digest('hex'));
  const given = Buffer.from(v1!);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) fail('signature does not match');
  try {
    return JSON.parse(body) as MalaposWebhookEvent<T>;
  } catch {
    return fail('webhook body is not valid JSON');
  }
}
