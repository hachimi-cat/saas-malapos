/**
 * Malapos SDK — typed JS/TS client for the malapos.com point-of-sale REST API.
 * Sister to `forjio-malapos` (Python) and `github.com/hachimi-cat/malapos-go` (Go).
 *
 * Every route of the API is a method on `client.api` (generated from the API spec:
 * api.generated.ts), e.g. `client.api.productsList({ q: 'kopi' })`.
 *
 * Auth = `Authorization: Bearer <token>` — an `sk_live_…` API key from the dashboard
 * (**API keys**; it acts in the workspace it was created in) or a Huudis-issued access
 * token. Pass `token` or set `MALAPOS_TOKEN`.
 *
 * Every response rides the Forjio envelope `{ data, error, meta }`; the client returns
 * `data` and throws `MalaposError` (with the envelope's `error.code`) on failure. A list
 * route that pages returns its array with `cursor` and `hasMore` on it (from `meta`);
 * pass the cursor back as the route's `cursor` query field for the next page.
 */

import { GeneratedApi } from './api.generated.js';

export { GeneratedApi } from './api.generated.js';

export interface ApiEnvelope<T> {
  data: T | null;
  error: { code: string; message: string; param?: string; docUrl?: string } | null;
  meta?: {
    requestId?: string;
    timestamp?: string;
    cursor?: string | null;
    hasMore?: boolean;
  };
}

export class MalaposError extends Error {
  /** HTTP status (0 for transport-level failures). */
  readonly status: number;
  /** Envelope `error.code` (UPPER_SNAKE_CASE) or an SDK-side code
   *  (`NETWORK_ERROR`, `TIMEOUT`, `INVALID_RESPONSE`). */
  readonly code: string;
  readonly requestId: string | undefined;
  readonly param: string | undefined;

  constructor(status: number, code: string, message: string, requestId?: string, param?: string) {
    super(message);
    this.name = 'MalaposError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.param = param;
  }
}

/** A list page: the route's array, with the envelope's paging meta on it. */
export type Page<T> = T[] & { cursor?: string | null; hasMore?: boolean };

export interface MalaposClientOptions {
  /** `sk_live_…` API key or a Huudis access token. Defaults to `MALAPOS_TOKEN`. */
  token?: string;
  /** API origin. Defaults to `MALAPOS_BASE_URL`, else `https://malapos.com`. */
  baseUrl?: string;
  /** Per-request timeout. Default 30s. */
  timeoutMs?: number;
  /** Test seam / custom transport. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
}

function env(name: string): string | undefined {
  return typeof process !== 'undefined' ? process.env?.[name] : undefined;
}

export class MalaposClient {
  private readonly token: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  /** Every feature route, one method each (generated from the API spec: api.generated.ts). */
  readonly api: GeneratedApi;

  constructor(opts: MalaposClientOptions = {}) {
    this.token = opts.token ?? env('MALAPOS_TOKEN') ?? undefined;
    this.baseUrl = (opts.baseUrl ?? env('MALAPOS_BASE_URL') ?? 'https://malapos.com').replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    this.api = new GeneratedApi(this);
  }

  /** Send one request and return the whole envelope (`data` + `meta`). */
  async requestEnvelope<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<ApiEnvelope<T>> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v));
    }
    const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    let res: Response;
    try {
      res = await this.fetchImpl(url.toString(), {
        method: method.toUpperCase(),
        headers,
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'TimeoutError') {
        throw new MalaposError(0, 'TIMEOUT', `request timed out after ${this.timeoutMs}ms`);
      }
      throw new MalaposError(0, 'NETWORK_ERROR', e instanceof Error ? e.message : String(e));
    }

    const text = await res.text();
    let envelope: ApiEnvelope<T>;
    if (!text) {
      if (!res.ok) throw new MalaposError(res.status, 'HTTP_ERROR', `HTTP ${res.status}`);
      return { data: null, error: null };
    }
    try {
      envelope = JSON.parse(text) as ApiEnvelope<T>;
    } catch {
      throw new MalaposError(res.status, 'INVALID_RESPONSE', `non-JSON response (HTTP ${res.status})`);
    }
    if (!res.ok || envelope.error) {
      const err = envelope.error;
      let message = err?.message ?? `HTTP ${res.status}`;
      if (res.status === 401 && !this.token) message += ' (no token configured: pass `token` or set MALAPOS_TOKEN)';
      throw new MalaposError(res.status, err?.code ?? 'HTTP_ERROR', message, envelope.meta?.requestId, err?.param);
    }
    return envelope;
  }

  /** Send one request and return its `data` (a paging list carries `cursor`/`hasMore`). */
  async request<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const envelope = await this.requestEnvelope<T>(method, path, opts);
    const data = envelope.data as T;
    const meta = envelope.meta;
    if (Array.isArray(data) && meta && ('cursor' in meta || 'hasMore' in meta)) {
      Object.defineProperties(data, {
        cursor: { value: meta.cursor ?? null, enumerable: false },
        hasMore: { value: Boolean(meta.hasMore), enumerable: false },
      });
    }
    return data;
  }

  /** The call behind `client.api.*` (api.generated.ts). */
  async apigenRequest(method: string, path: string, query: Record<string, unknown> | undefined, body: unknown): Promise<unknown> {
    return this.request<unknown>(method, path, { query, body });
  }
}
