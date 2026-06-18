import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Wrap an async route handler so unhandled rejections reach the
 * express error middleware. Ported from saas-plugipay.
 *
 *   router.get('/x', h(async (req, res) => { ... }));
 */
export function h(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
