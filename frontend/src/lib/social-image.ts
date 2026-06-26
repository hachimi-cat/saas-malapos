/**
 * Frontend helper: route hot-link-blocked CDN URLs through Ripllo's
 * `/api/v1/img-proxy` route. Used by every `<img>` that may carry a raw
 * URL pulled from Apify-scraped social platforms.
 *
 * Ported from saas-ripllo. The one adaptation for the merchant module:
 * this product serves no `/api/v1/img-proxy` of its own, so the proxy
 * target (and the creator-avatar signed-URL endpoint) is an ABSOLUTE
 * ripllo.com URL via RIPLLO_BASE — same convention creator-picker.tsx
 * uses to link creator profiles back to ripllo.com (Ripllo is the
 * marketplace authority; this product hosts no img-proxy/uploads route).
 *
 * Why: Instagram + Facebook CDNs (cdninstagram.com / fbcdn.net) refuse
 * cross-origin image loads — the browser gets a 403. The proxy
 * server-side fetches them with the right Referer header. YouTube +
 * TikTok URLs render direct and pass through unchanged.
 */

export const RIPLLO_BASE = process.env.NEXT_PUBLIC_RIPLLO_BASE ?? 'https://ripllo.com';

// Same-origin API base for the merchant-hosted image passthrough
// (backend routes/marketing-media.ts). NEXT_PUBLIC_API_URL may be a bare
// origin (dev) OR already include the /api/v1 prefix (CI sets the
// relative '/api/v1'); strip a trailing /api/v1 so we append the full
// path exactly once. Mirrors lib/marketing-api.ts's BASE_URL rule.
export const API_BASE = (
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4191'
).replace(/\/api\/v1\/?$/, '');

const NEEDS_PROXY_SUFFIXES: readonly string[] = ['cdninstagram.com', 'fbcdn.net'];

/**
 * Returns a usable `<img src>` for a social-CDN URL. IG/FB CDNs are
 * rewritten through ripllo's `/api/v1/img-proxy`; everything else passes
 * through. Null-safe: returns null for null/undefined/empty input.
 */
export function socialImageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const host = parsed.hostname.toLowerCase();
  const needsProxy = NEEDS_PROXY_SUFFIXES.some(
    (s) => host === s || host.endsWith(`.${s}`),
  );
  if (needsProxy) {
    // Route through THIS merchant origin (same-origin) so the browser
    // carries the session cookie + skips CORS; the backend forwards to
    // ripllo's public img-proxy server-side.
    return `${API_BASE}/api/v1/account/marketing-media/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}
