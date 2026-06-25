import { Router } from 'express';
import type { FetchArgs } from '@forjio/plugipay-node';
import { sendOk } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handlePlugipayError } from '../../services/plugipay-proxy.js';
import { streamFromPlugipay } from '../../services/plugipay-raw-proxy.js';

/*
 * /api/v1/payments/plugipay-settings/<rest> → Plugipay /api/v1/<rest>,
 * scoped to the merchant's workspace. A generic catch-all passthrough so
 * the Payment-module settings pages (Providers, Payment methods,
 * Templates) can drive Plugipay's own settings APIs without
 * reimplementing each one here. malapos port of storlaunch's
 * payment/plugipay-settings-proxy.ts. requireAuth at the mount.
 */

const router = Router();

// Template preview returns raw HTML (not envelope JSON) — route through
// the raw-passthrough helper so the catch-all below doesn't JSON-parse it.
router.post(
  '/templates/preview',
  asyncHandler(async (req, res) => {
    await streamFromPlugipay(res, req.auth!.accountId as string, '/api/v1/templates/preview', {
      method: 'POST',
      body: req.body ?? {},
    });
  }),
);

router.all(
  /.*/,
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      // req.path is relative to this router's mount — strip leading '/'
      // and preserve the query string from the original URL.
      const suffix = req.path.replace(/^\/+/, '');
      const query = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
      const upstream = `/api/v1/${suffix}${query}`;

      const rawMethod = req.method.toUpperCase();
      if (rawMethod === 'HEAD' || rawMethod === 'OPTIONS') {
        return res.status(204).send();
      }
      const method = rawMethod as FetchArgs['method'];
      const bodyAllowed = method !== 'GET' && method !== 'DELETE';
      const idem =
        typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined;

      const data = await client.request<unknown>({
        method,
        path: upstream,
        body: bodyAllowed ? (req.body ?? {}) : undefined,
        idempotencyKey: idem,
      });
      return sendOk(res, req, data);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

export default router;
