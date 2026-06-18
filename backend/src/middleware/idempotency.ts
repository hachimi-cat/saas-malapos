import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { createHash } from 'node:crypto';
import { sendErr } from '../lib/http.js';

/**
 * Idempotency-Key middleware. Ported from saas-plugipay.
 *
 * Cache is process-local (a product scaling beyond one node should
 * replace this with redis or the Postgres outbox table — see
 * ADR-0003). Behavior:
 *   - no Idempotency-Key + `required=true`  → 400 VALIDATION_ERROR
 *   - key + same body, within TTL           → replay the cached response
 *   - key + different body                  → 409 IDEMPOTENCY_KEY_IN_USE
 *   - new key                                → record the 2xx response
 *
 * Scopes cache entries by accountId+method+path so different callers
 * can reuse the same key on different endpoints without collision.
 */

interface CachedResponse {
  status: number;
  body: unknown;
  bodyHash: string;
  expiresAt: number;
}

const cache = new Map<string, CachedResponse>();
const TTL_MS = 24 * 60 * 60 * 1000;

function hashBody(body: unknown): string {
  const s = body === undefined || body === null ? '' : JSON.stringify(body);
  return createHash('sha256').update(s).digest('hex');
}

function cacheKey(accountId: string, method: string, path: string, idem: string): string {
  return `${accountId}|${method}|${path}|${idem}`;
}

export function idempotency(opts: { required: boolean }): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.headers['idempotency-key'];
    const k = Array.isArray(key) ? key[0] : key;
    if (!k) {
      if (opts.required) {
        return sendErr(res, req, 400, 'VALIDATION_ERROR', 'Idempotency-Key header is required', {
          param: 'Idempotency-Key',
        });
      }
      return next();
    }
    // Without auth we can't scope the key to an account; fall through
    // and let the route handle it. Products that wire this before
    // auth should move the middleware order.
    const claims = req.auth as { sub?: string; accountId?: string } | undefined;
    const accountId = claims?.accountId ?? claims?.sub ?? 'anonymous';
    const path = (req.originalUrl || req.url).split('?')[0] ?? '';
    const ck = cacheKey(accountId, req.method.toUpperCase(), path, k);
    const cached = cache.get(ck);
    const bodyHash = hashBody(req.body);
    if (cached) {
      if (cached.expiresAt < Date.now()) {
        cache.delete(ck);
      } else if (cached.bodyHash !== bodyHash) {
        return sendErr(res, req, 409, 'IDEMPOTENCY_KEY_IN_USE', 'Idempotency-Key reused with a different body');
      } else {
        return res.status(cached.status).json(cached.body);
      }
    }

    const origJson = res.json.bind(res);
    res.json = (body: unknown) => {
      const status = res.statusCode;
      if (status >= 200 && status < 300) {
        cache.set(ck, { status, body, bodyHash, expiresAt: Date.now() + TTL_MS });
      }
      return origJson(body);
    };
    next();
  };
}

export function clearIdempotencyCache() {
  cache.clear();
}
