import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { sendErr } from '../lib/http.js';

/**
 * Centralised ZodError → 400 VALIDATION_ERROR handler. Mount BEFORE
 * the generic error handler in app.ts so validation failures render
 * as a clean Forjio envelope with `param` filled in.
 */
export const zodErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const param = first?.path.join('.') || undefined;
    const message = first?.message ?? 'validation failed';
    return sendErr(res, req, 400, 'VALIDATION_ERROR', message, param ? { param } : {});
  }
  next(err);
};
