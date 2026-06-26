/**
 * Same-origin binary image passthrough for the marketing creator-profile
 * surfaces (creator avatars + post thumbnails).
 *
 * Why this exists: the marketing pages render creator avatars + social
 * post thumbnails whose bytes live on Ripllo (ripllo.com). Loading them
 * directly from ripllo.com is cross-origin — the avatar signed-URL fetch
 * is CORS-blocked from the merchant frontend, and IG/FB CDNs 403
 * hot-links. Routing the bytes through THIS merchant origin makes the
 * `<img src>` same-origin (carries the session cookie → requireAuth at
 * the mount authenticates the browser via the BFF cookie path).
 *
 * Both upstream Ripllo endpoints are PUBLIC (no partner auth):
 *   - GET /api/v1/img-proxy?url=...      → binary image bytes
 *   - GET /api/v1/uploads/avatar?key=... → JSON { data: { url } } where
 *     url is a short-lived signed S3 GET (key must start with
 *     `creators/` or `affiliators/`).
 * So a plain Node `fetch` resolves + streams them server-side.
 */
import { Router } from 'express';

const router = Router();

const RIPLLO_PUBLIC_BASE = (process.env.RIPLLO_PUBLIC_BASE ?? 'https://ripllo.com').replace(
  /\/$/,
  '',
);

/** Fetch `target` and stream its bytes back to the browser with a
 *  24h cache. Non-2xx upstream → propagate status (or 502). */
async function streamImage(target: string, res: import('express').Response): Promise<void> {
  const u = await fetch(target);
  if (!u.ok) {
    res.status(u.status || 502).end();
    return;
  }
  res.setHeader('content-type', u.headers.get('content-type') ?? 'image/jpeg');
  res.setHeader('cache-control', 'public, max-age=86400');
  res.end(Buffer.from(await u.arrayBuffer()));
}

/** GET /avatar?key=creators/… — resolve the creator's signed S3 avatar
 *  URL via Ripllo's public uploads endpoint, then stream the bytes. */
router.get('/avatar', async (req, res) => {
  try {
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    if (!key.startsWith('creators/') && !key.startsWith('affiliators/')) {
      res.status(400).end();
      return;
    }
    const u = await fetch(
      `${RIPLLO_PUBLIC_BASE}/api/v1/uploads/avatar?key=${encodeURIComponent(key)}`,
    );
    if (!u.ok) {
      res.status(u.status || 502).end();
      return;
    }
    const body = (await u.json()) as { data?: { url?: string } } | null;
    const url = body?.data?.url;
    if (typeof url !== 'string' || url.length === 0) {
      res.status(404).end();
      return;
    }
    await streamImage(url, res);
  } catch {
    res.status(502).end();
  }
});

/** GET /proxy?url=… — stream an arbitrary (hot-link-blocked) social CDN
 *  image through Ripllo's public img-proxy. */
router.get('/proxy', async (req, res) => {
  try {
    const url = typeof req.query.url === 'string' ? req.query.url : '';
    if (!url) {
      res.status(400).end();
      return;
    }
    await streamImage(
      `${RIPLLO_PUBLIC_BASE}/api/v1/img-proxy?url=${encodeURIComponent(url)}`,
      res,
    );
  } catch {
    res.status(502).end();
  }
});

export default router;
