import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Rate-limit headers. Ported from saas-plugipay. Template ships a
 * HEADER-ONLY skeleton — the actual limiter is per-product (redis
 * bucket, sliding window, upstream limiter, etc.). Products swap the
 * body when they're ready; this keeps the route signatures stable
 * and the client visible headers consistent from day 1.
 */
export type RateClass = 'mutating_heavy' | 'mutating_light' | 'read' | 'events_stream' | 'ingress';

const LIMITS: Record<RateClass, number> = {
  mutating_heavy: 60,
  mutating_light: 300,
  read: 600,
  events_stream: 5,
  ingress: 2000,
};

export function rateLimit(cls: RateClass): RequestHandler {
  const limit = LIMITS[cls];
  return (_req: Request, res: Response, next: NextFunction) => {
    const reset = Math.floor(Date.now() / 1000) + 60;
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(limit - 1));
    res.setHeader('X-RateLimit-Reset', String(reset));
    next();
  };
}
