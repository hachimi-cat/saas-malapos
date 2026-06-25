import type { Request, Response, NextFunction } from 'express';
import { FulkrumaError } from '@forjio/fulkruma-node';
import { sendErr } from '../lib/http.js';

/*
 * Thin proxy glue for the Fulfillment (Fulkruma) merchant routers — the
 * malapos adaptation of storlaunch's services/fulkruma-proxy.ts and a
 * mirror of this repo's services/plugipay-proxy.ts.
 *
 * `requireMerchantClient(accountId)` is an alias for malapos's gated
 * `requireFulfillmentClient` (services/fulkruma-module-service.ts): it
 * returns a per-merchant `FulkrumaClient`, or throws a plain Error with
 * `code = 'fulfillment_module_disabled'` / `status = 409` when the
 * Fulfillment module is off for the workspace.
 *
 * `handleFulkrumaError` maps a thrown gate/SDK error into the malapos
 * `{ data, error, meta }` envelope (lib/http.ts). Anything it doesn't
 * recognise bubbles to the express error middleware via `next`.
 */

export { requireFulfillmentClient as requireMerchantClient } from './fulkruma-module-service.js';

export function handleFulkrumaError(
  res: Response,
  req: Request,
  err: unknown,
  next: NextFunction,
): Response | void {
  const e = err as Error & { status?: number; code?: string; name?: string };
  if (e.code === 'fulfillment_module_disabled') {
    return sendErr(res, req, 409, 'FULFILLMENT_MODULE_DISABLED', e.message);
  }
  if (e instanceof FulkrumaError || e.name === 'FulkrumaError') {
    const status = e.status && e.status >= 400 ? e.status : 502;
    return sendErr(res, req, status, e.code ?? 'FULKRUMA_ERROR', e.message);
  }
  return next(err);
}
