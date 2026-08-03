import crypto from 'node:crypto';
import { PlugipayError } from '@forjio/plugipay-node';
import { prisma } from '../lib/db.js';

type JsonMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
const PLUGIPAY_BASE_URL = (process.env.PLUGIPAY_BASE_URL ?? 'https://plugipay.com').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 30_000;

/** Signed Plugipay JSON request with the provider page's selected mode. */
export async function requestJsonFromPlugipay<T>(
  accountId: string,
  upstreamPath: string,
  opts: { method: JsonMethod; body?: unknown; idempotencyKey?: string; mode: 'live' | 'test' },
): Promise<T> {
  const row = await prisma.posSettings.findUnique({
    where: { accountId },
    select: { plugipayMerchantAccountId: true, modulesEnabled: true },
  });
  const modules = (row?.modulesEnabled as { payment?: boolean } | null) ?? {};
  if (!row?.plugipayMerchantAccountId || modules.payment !== true) {
    const err = new Error('Payment module is not enabled for this account');
    Object.assign(err, { code: 'payment_module_disabled', status: 409 });
    throw err;
  }
  const keyId = process.env.PLUGIPAY_KEY_ID;
  const secret = process.env.PLUGIPAY_SECRET;
  if (!keyId || !secret) throw new Error('PLUGIPAY_KEY_ID/SECRET missing');

  const bodyJson = opts.body !== undefined ? JSON.stringify(opts.body) : null;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyHash = crypto.createHash('sha256').update(bodyJson ?? '').digest('hex');
  const idem = opts.idempotencyKey ? `\n${opts.idempotencyKey}` : '';
  const signature = crypto.createHmac('sha256', secret)
    .update(`${opts.method}\n${upstreamPath}\n${timestamp}\n${bodyHash}${idem}`)
    .digest('hex');
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Plugipay-HMAC-SHA256 keyId=${keyId}, scope=*, signature=${signature}`,
    'X-Plugipay-Timestamp': timestamp,
    'X-Plugipay-On-Behalf-Of': row.plugipayMerchantAccountId,
    'X-Plugipay-Mode': opts.mode,
  };
  if (bodyJson) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${PLUGIPAY_BASE_URL}${upstreamPath}`, {
      method: opts.method,
      headers,
      body: bodyJson ?? undefined,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if ((error as Error).name === 'AbortError') {
      throw new PlugipayError(0, 'timeout', `Plugipay request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw new PlugipayError(0, 'network_error', (error as Error).message);
  }
  clearTimeout(timer);

  const responseText = await response.text();
  let envelope: {
    data?: T;
    error?: { code?: string; message?: string } | null;
    meta?: { requestId?: string };
  };
  try {
    envelope = JSON.parse(responseText) as typeof envelope;
  } catch {
    throw new PlugipayError(response.status, 'invalid_response', `Non-JSON response: ${responseText.slice(0, 200)}`);
  }
  if (!response.ok || envelope?.error) {
    throw new PlugipayError(
      response.status,
      envelope?.error?.code ?? 'PLUGIPAY_ERROR',
      envelope?.error?.message ?? `Plugipay request failed (${response.status})`,
      envelope?.meta?.requestId,
    );
  }
  return envelope.data as T;
}
