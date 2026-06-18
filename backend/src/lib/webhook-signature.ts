import crypto from 'node:crypto';

/**
 * Webhook delivery signature — the Forjio family HMAC convention
 * (Plugipay-HMAC / Fulkruma-HMAC / …, here Malapos flavored):
 *
 *   Malapos-Signature: t=<unix>,v1=<hex hmac-sha256(secret, t + "." + body)>
 *
 * Receivers recompute the HMAC over `${t}.${rawBody}` with their
 * `whsec_…` secret and compare against `v1` (constant-time), rejecting
 * stale timestamps to blunt replay.
 */

export const SIGNATURE_HEADER = 'Malapos-Signature';

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

/** Build the `t=…,v1=…` header value for a serialized event body. */
export function buildWebhookSignature(
  secret: string,
  body: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): string {
  const v1 = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/** Verify a `t=…,v1=…` header against a body. Exposed mainly for tests
 *  and for documenting the receiver-side algorithm. */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  opts: { toleranceSeconds?: number; now?: number } = {},
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i), kv.slice(i + 1)] as const;
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;

  const tolerance = opts.toleranceSeconds ?? 300;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > tolerance) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(v1, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
