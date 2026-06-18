import type { Request, Response, NextFunction } from 'express';
import { ulid } from 'ulid';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

/**
 * Attach a requestId to every request. Accepts an inbound
 * `X-Request-Id` header (trace-propagation from upstream) or mints
 * `req_<ulid>`. Echoes the chosen id back on the response so clients
 * and logs line up. Ported from saas-plugipay.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  const provided = Array.isArray(incoming) ? incoming[0] : incoming;
  if (provided && typeof provided === 'string' && provided.length <= 64) {
    req.requestId = provided;
  } else {
    req.requestId = `req_${ulid()}`;
  }
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
