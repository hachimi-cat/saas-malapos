/**
 * Browser-side fetch client. Ported from saas-plugipay.
 *
 * Every mutating request automatically gets an `Idempotency-Key` if
 * the caller didn't supply one — the backend middleware dedupes
 * retries within 24h. Responses are unwrapped from the Forjio
 * envelope; failures throw `ApiRequestError` so route handlers can
 * use try/catch and pipe the code into an <ErrorPanel>.
 *
 * For server components (RSC / route handlers that need to forward
 * cookies), use `api-server.ts` instead — this file is browser-safe
 * and does not import next/headers.
 */

export type Envelope<T> = {
  data: T | null;
  error: ApiErrorShape | null;
  meta: { requestId: string; timestamp: string; cursor?: string | null; hasMore?: boolean };
};

export type ApiErrorShape = {
  code: string;
  message: string;
  param?: string;
  docUrl?: string;
};

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly param?: string;
  constructor(status: number, err: ApiErrorShape) {
    super(err.message);
    this.code = err.code;
    this.status = status;
    this.param = err.param;
  }
}

const BASE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4191';

const API_PREFIX = '/api/v1';

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
};

function randomIdemKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `idem_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export async function apiRequest<T = unknown>(
  path: string,
  opts: RequestOptions = {},
): Promise<{ data: T; meta: Envelope<T>['meta'] }> {
  const method = opts.method ?? 'GET';
  const url = `${BASE_URL}${API_PREFIX}${path}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.headers ?? {}),
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const mutating = method !== 'GET';
  if (mutating && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] = opts.idempotencyKey ?? randomIdemKey();
  }

  const init: RequestInit = {
    method,
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  };
  if (opts.cache) init.cache = opts.cache;
  if (opts.next) (init as RequestInit & { next?: unknown }).next = opts.next;

  const res = await fetch(url, init);

  let env: Envelope<T>;
  try {
    env = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiRequestError(res.status, {
      code: 'NETWORK_ERROR',
      message: `Network error (${res.status})`,
    });
  }

  if (!res.ok || env.error) {
    throw new ApiRequestError(
      res.status,
      env.error ?? { code: 'INTERNAL_ERROR', message: `Request failed (${res.status})` },
    );
  }

  return { data: (env.data as T) ?? (null as unknown as T), meta: env.meta };
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T>(path: string, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'DELETE' }),
};
