/*
 * Ripllo (Marketing) proxy helpers — the storlaunch `ripllo-proxy`
 * shape, adapted to Malapos. Backs the generic marketing passthrough
 * (routes/marketing-proxy.ts) + the thin native typed routes
 * (routes/marketing/{blog,feeds,pixels,abandoned-cart}.ts).
 *
 * `requireRipploClient` is an alias of the gated per-merchant client
 * factory from ripllo-module-service (throws `marketing_module_disabled`
 * / 409 when the Marketing module is off). `handleRipploError` maps a
 * thrown Ripllo/module error onto the Malapos envelope so route handlers
 * can `try/catch` uniformly. Anything it can't classify is passed to
 * `next()` for the express error handler.
 */
import type { Request, Response, NextFunction } from 'express';
import { RiplloError } from '@forjio/ripllo-node';
import { sendErr } from '../lib/http.js';
import { requireMarketingClient } from './ripllo-module-service.js';

export const requireRipploClient = requireMarketingClient;

export function handleRipploError(
  res: Response,
  req: Request,
  err: unknown,
  next: NextFunction,
): Response | void {
  const e = err as Error & { status?: number; code?: string; name?: string };
  if (e.code === 'marketing_module_disabled') {
    return sendErr(res, req, 409, 'MARKETING_MODULE_DISABLED', e.message);
  }
  if (e instanceof RiplloError || e.name === 'RiplloError') {
    const status = e.status && e.status >= 400 ? e.status : 502;
    return sendErr(res, req, status, e.code || 'RIPLLO_ERROR', e.message);
  }
  if (e.status && e.code) return sendErr(res, req, e.status, e.code, e.message);
  return next(err);
}
