import type { Request, Response } from 'express';

/**
 * Forjio API response envelope helpers. Ported from saas-plugipay.
 *
 * The wire shape matches `@forjio/sdk/http`'s envelope contract:
 * `{ data, error, meta: { requestId, timestamp, cursor?, hasMore? } }`.
 * We inline it here (rather than calling `ok`/`err` from the SDK) so
 * we can attach optional `cursor` + `hasMore` on list responses and
 * `param` + `docUrl` on errors without fighting the SDK types.
 *
 * Error codes are UPPER_SNAKE_CASE. Use the constants below or pass a
 * literal; stay consistent so test regexes stay uniform.
 */

export interface Envelope<T> {
  data: T | null;
  error: null | { code: string; message: string; param?: string; docUrl?: string };
  meta: {
    requestId: string;
    timestamp: string;
    cursor?: string | null;
    hasMore?: boolean;
  };
}

function reqId(req: Request): string {
  return req.requestId ?? 'req_unknown';
}

function now(): string {
  return new Date().toISOString();
}

export function successEnvelope<T>(data: T, requestId: string): Envelope<T> {
  return { data, error: null, meta: { requestId, timestamp: now() } };
}

export function errorEnvelope(
  code: string,
  message: string,
  requestId: string,
  opts: { param?: string; docUrl?: string } = {},
): Envelope<null> {
  const error: NonNullable<Envelope<null>['error']> = { code, message };
  if (opts.param) error.param = opts.param;
  if (opts.docUrl) error.docUrl = opts.docUrl;
  return { data: null, error, meta: { requestId, timestamp: now() } };
}

export function listEnvelope<T>(
  data: T[],
  requestId: string,
  cursor: string | null,
  hasMore: boolean,
): Envelope<T[]> {
  return {
    data,
    error: null,
    meta: { requestId, timestamp: now(), cursor, hasMore },
  };
}

export function sendOk<T>(res: Response, req: Request, data: T, status = 200): Response {
  return res.status(status).json(successEnvelope(data, reqId(req)));
}

export function sendCreated<T>(res: Response, req: Request, data: T): Response {
  return sendOk(res, req, data, 201);
}

export function sendList<T>(
  res: Response,
  req: Request,
  data: T[],
  cursor: string | null,
  hasMore: boolean,
  status = 200,
): Response {
  return res.status(status).json(listEnvelope(data, reqId(req), cursor, hasMore));
}

export function sendErr(
  res: Response,
  req: Request,
  status: number,
  code: string,
  message: string,
  opts: { param?: string; docUrl?: string } = {},
): Response {
  return res.status(status).json(errorEnvelope(code, message, reqId(req), opts));
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly param?: string | undefined;
  constructor(status: number, code: string, message: string, param?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.param = param;
  }
}

export function notFound(message = 'resource not found'): ApiError {
  return new ApiError(404, 'NOT_FOUND', message);
}

export function conflict(message: string): ApiError {
  return new ApiError(409, 'CONFLICT', message);
}

export function validation(message: string, param?: string): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', message, param);
}

export function forbidden(message = 'insufficient scope'): ApiError {
  return new ApiError(403, 'FORBIDDEN', message);
}

export function unauthorized(message = 'authentication required'): ApiError {
  return new ApiError(401, 'AUTH_REQUIRED', message);
}
