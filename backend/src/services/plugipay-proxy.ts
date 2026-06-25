import type { Request, Response, NextFunction } from 'express';
import { PlugipayError } from '@forjio/plugipay-node';
import { sendErr } from '../lib/http.js';

/*
 * Thin proxy glue for the Payment (Plugipay) merchant routers — the
 * malapos adaptation of storlaunch's services/plugipay-proxy.ts.
 *
 * `requireMerchantClient(accountId)` is just an alias for malapos's
 * gated `requirePaymentClient` (services/plugipay-module-service.ts):
 * it returns a per-merchant `PlugipayClient`, or throws a plain Error
 * with `code = 'payment_module_disabled'` / `status = 409` when the
 * Payment module is off for the workspace.
 *
 * `handlePlugipayError` maps a thrown gate/SDK error into the malapos
 * `{ data, error, meta }` envelope (lib/http.ts). Anything it doesn't
 * recognise bubbles to the express error middleware via `next`.
 */

export { requirePaymentClient as requireMerchantClient } from './plugipay-module-service.js';

export function handlePlugipayError(
  res: Response,
  req: Request,
  err: unknown,
  next: NextFunction,
): Response | void {
  const e = err as Error & { status?: number; code?: string; name?: string };
  if (e.code === 'payment_module_disabled') {
    return sendErr(res, req, 409, 'PAYMENT_MODULE_DISABLED', e.message);
  }
  if (e instanceof PlugipayError || e.name === 'PlugipayError') {
    const status = e.status && e.status >= 400 ? e.status : 502;
    return sendErr(res, req, status, e.code ?? 'PLUGIPAY_ERROR', e.message);
  }
  return next(err);
}
