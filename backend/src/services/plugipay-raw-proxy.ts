import crypto from 'node:crypto';
import type { Response } from 'express';
import { prisma } from '../lib/db.js';

const PLUGIPAY_BASE_URL = process.env.PLUGIPAY_BASE_URL ?? 'https://plugipay.com';

/*
 * Stream a raw (non-JSON) response from a merchant's Plugipay workspace
 * to the caller — PDF / HTML / CSV / ESC-POS. The SDK parses envelopes
 * and can't handle binary, so we sign the request with the platform key
 * + an on-behalf-of header (the per-merchant Plugipay accountId) and
 * forward the bytes through.
 *
 * malapos adaptation of storlaunch's services/plugipay-raw-proxy.ts:
 * the per-merchant workspace id + the Payment module flag live on
 * PosSettings (not an Account model).
 *
 * Assumes the caller already authed via requireAuth; this helper only
 * adds the Plugipay HMAC signature + on-behalf-of header.
 */
export async function streamFromPlugipay(
  res: Response,
  accountId: string,
  upstreamPath: string,
  opts: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<void> {
  const method = opts.method ?? 'GET';
  const row = await prisma.posSettings.findUnique({
    where: { accountId },
    select: { plugipayMerchantAccountId: true, modulesEnabled: true },
  });
  const modules = (row?.modulesEnabled as { payment?: boolean } | null) ?? {};
  if (!row?.plugipayMerchantAccountId || modules.payment !== true) {
    res.status(409).json({
      data: null,
      error: { code: 'PAYMENT_MODULE_DISABLED', message: 'Payment module not enabled' },
      meta: { requestId: 'req_unknown', timestamp: new Date().toISOString() },
    });
    return;
  }
  const keyId = process.env.PLUGIPAY_KEY_ID;
  const secret = process.env.PLUGIPAY_SECRET;
  if (!keyId || !secret) {
    res.status(500).json({
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'PLUGIPAY_KEY_ID/SECRET missing' },
      meta: { requestId: 'req_unknown', timestamp: new Date().toISOString() },
    });
    return;
  }

  const bodyJson = opts.body !== undefined ? JSON.stringify(opts.body) : null;
  const ts = String(Math.floor(Date.now() / 1000));
  const bodyHash = crypto.createHash('sha256').update(bodyJson ?? '').digest('hex');
  const stringToSign = `${method}\n${upstreamPath}\n${ts}\n${bodyHash}`;
  const sig = crypto.createHmac('sha256', secret).update(stringToSign).digest('hex');

  const headers: Record<string, string> = {
    Authorization: `Plugipay-HMAC-SHA256 keyId=${keyId}, scope=*, signature=${sig}`,
    'X-Plugipay-Timestamp': ts,
    'X-Plugipay-On-Behalf-Of': row.plugipayMerchantAccountId,
    Accept: '*/*',
  };
  if (bodyJson) headers['Content-Type'] = 'application/json';

  const upstream = await fetch(`${PLUGIPAY_BASE_URL}${upstreamPath}`, {
    method,
    headers,
    body: bodyJson ?? undefined,
  });

  res.status(upstream.status);
  const contentType = upstream.headers.get('content-type');
  if (contentType) res.setHeader('Content-Type', contentType);
  const disposition = upstream.headers.get('content-disposition');
  if (disposition) res.setHeader('Content-Disposition', disposition);

  const buf = Buffer.from(await upstream.arrayBuffer());
  res.send(buf);
}
