import type { BffHttp } from '@forjio/agent-ui';
import { apiRequest, apiUrl, ApiRequestError } from '@/lib/api';

/**
 * The BffHttp shim @forjio/agent-ui's createBffChatAdapters needs, over
 * malapos's fetch-based api client. Two impedance points:
 *
 *  - apiRequest already UNWRAPS the envelope (returns `{data: payload}`),
 *    which is exactly the `resp.data ?? resp` shape the adapters read —
 *    no double unwrap.
 *  - the composer's attachment upload posts FormData; apiRequest
 *    JSON.stringifies bodies, so multipart goes through raw fetch with
 *    the browser deriving the boundary (never set Content-Type).
 */
export const catentioHttp: BffHttp = {
  get: (url, cfg) =>
    apiRequest(url, {
      method: 'GET',
      ...(cfg?.timeout ? { signal: AbortSignal.timeout(cfg.timeout) } : {}),
    }),
  post: async (url, body, cfg) => {
    if (body instanceof FormData) {
      const res = await fetch(apiUrl(url), {
        method: 'POST',
        credentials: 'include',
        body,
        ...(cfg?.timeout ? { signal: AbortSignal.timeout(cfg.timeout) } : {}),
      });
      const env = (await res.json().catch(() => null)) as {
        data?: unknown;
        error?: { code: string; message: string } | null;
      } | null;
      if (!res.ok || env?.error) {
        throw new ApiRequestError(
          res.status,
          env?.error ?? { code: 'INTERNAL_ERROR', message: `Upload failed (${res.status})` },
        );
      }
      return { data: env?.data };
    }
    return apiRequest(url, {
      method: 'POST',
      body,
      ...(cfg?.timeout ? { signal: AbortSignal.timeout(cfg.timeout) } : {}),
    });
  },
  put: (url, body) => apiRequest(url, { method: 'PUT', body }),
  delete: (url) => apiRequest(url, { method: 'DELETE' }),
};
