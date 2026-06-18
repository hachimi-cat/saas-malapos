import express from 'express';
import cookieParser from 'cookie-parser';
import type { Express, Request, Response, NextFunction } from 'express';
import { requestId } from './middleware/request-id.js';
import { zodErrorHandler } from './middleware/zod-error.js';
import { ApiError, sendErr } from './lib/http.js';
import routes from './routes/index.js';

/**
 * Express app factory. Ported from saas-plugipay.
 *
 * `createApp` is side-effect-free — no ports bound, no outbox worker
 * started. Tests instantiate it directly; `src/index.ts` wraps it with
 * `.listen()` + worker bootstrap. This split lets the unit tests hit a
 * real router without touching the network or process lifecycle.
 */

export interface CreateAppOptions {
  /** Mount `/test-only/*` routes — ONLY enable in unit/integration
   *  tests. Never in production. */
  enableTestOnlyRoutes?: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Exact bytes of the JSON request body, captured by the body
     *  parser's `verify` hook. Webhook signature verification (e.g.
     *  routes/webhooks-plugipay.ts) MUST run over these — HMACs are
     *  computed on the wire bytes, not a re-serialization. */
    rawBody?: string;
  }
}

function normalizeEmptyBody(req: Request, _res: Response, next: NextFunction) {
  if (
    req.body &&
    typeof req.body === 'object' &&
    !Array.isArray(req.body) &&
    Object.keys(req.body as object).length === 0
  ) {
    req.body = undefined;
  }
  next();
}

export function createApp(opts: CreateAppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as Request).rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(cookieParser());
  app.use(normalizeEmptyBody);
  app.use(requestId);

  app.use('/api/v1', routes(opts));

  // Unmatched /api/v1 paths → 404 envelope (not the default HTML).
  app.use('/api/v1', (req, res) => {
    sendErr(res, req, 404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`);
  });

  // ZodError → 400 VALIDATION_ERROR (must come before generic handler).
  app.use(zodErrorHandler);

  // Generic error handler.
  app.use((e: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (e instanceof ApiError) {
      return sendErr(res, req, e.status, e.code, e.message, e.param ? { param: e.param } : {});
    }
    console.error('[api] unhandled', e);
    const msg = e instanceof Error ? e.message : 'unexpected server error';
    return sendErr(res, req, 500, 'INTERNAL_ERROR', msg);
  });

  return app;
}
