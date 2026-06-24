import type { NextConfig } from 'next';

/**
 * `/api/*` is proxied to the backend so the browser can use relative
 * paths (`/api/v1/auth/login` etc.) — which is what @forjio/auth-ui
 * and the api.ts client emit. In production nginx proxies `/api`, so
 * the rewrite is DEV-ONLY (CI builds set NEXT_PUBLIC_API_URL to the
 * relative '/api/v1', which yields no absolute origin to proxy to).
 *
 * CRITICAL: the rewrite must exclude `/api/v1/console/*` — that path
 * is served by the app-router admin BFF proxy (app/api/v1/console/
 * [...path]/route.ts), which is a DYNAMIC route. Next applies
 * afterFiles rewrites BEFORE dynamic routes, so a blanket
 * `/api/:path*` rewrite shadows the console proxy entirely (every
 * console call 404'd in production — Safari surfaced it as "The
 * string did not match the expected pattern" when JSON.parse hit the
 * HTML 404 page). Template bug found spawning suppuo.
 */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4191';
const API_ORIGIN_ABSOLUTE = /^https?:\/\//.test(API_ORIGIN);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Back-compat redirects for the 2026-06 module-namespace migration:
   * every module-gated page now lives under its module's URL prefix
   * (`/dashboard/payments/*`, `/dashboard/fulfillment/*`,
   * `/dashboard/marketing/*`) so the module gate collapses to a single
   * prefix. These 308s keep old bookmarks / deep links resolving.
   */
  async redirects() {
    return [
      { source: '/dashboard/gift-cards', destination: '/dashboard/payments/gift-cards', permanent: true },
      { source: '/dashboard/delivery', destination: '/dashboard/fulfillment', permanent: true },
      { source: '/dashboard/delivery/:path*', destination: '/dashboard/fulfillment/:path*', permanent: true },
    ];
  },
  async rewrites() {
    if (!API_ORIGIN_ABSOLUTE) return []; // prod: nginx owns /api
    return [
      {
        // Negative lookahead keeps /api/v1/console/* on the app router.
        source: '/api/:path((?!v1/console).*)',
        destination: `${API_ORIGIN}/api/:path`,
      },
    ];
  },
};

export default nextConfig;
