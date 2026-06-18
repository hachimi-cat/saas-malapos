import { NextRequest } from 'next/server';

/*
 * Admin BFF proxy → this product's backend.
 *
 * The backend is the BFF — it owns auth. This same-origin proxy
 * forwards the browser's request (including the admin session cookie)
 * to the backend and stamps an authoritative `X-Forjio-Brand-Role:
 * admin` header so the shared auth-server kit resolves the *admin*
 * role session (a user signed into both the merchant and admin
 * portals has two cookies; the role header disambiguates).
 *
 * It is mounted at `/api/v1/console/*` — NOT `/api/v1/admin/*`. The
 * backend reserves `/api/v1/admin/*` for the actual admin API routers
 * (guarded by `adminGuard`); routing the frontend proxy through a
 * `/console/` prefix avoids the path collision, and the proxy rewrites
 * `console/...` → `admin/...` (and passes `auth/...` straight through)
 * on the way upstream.
 *
 * Path mapping (browser path → backend path):
 *   /api/v1/console/auth/me      → /api/v1/auth/me      (session resolve)
 *   /api/v1/console/auth/logout  → /api/v1/auth/logout  (clear cookie)
 *   /api/v1/console/<anything>   → /api/v1/admin/<anything>
 *
 * FORKERS: `scripts/rename.sh` rewrites the `malapos` slug and
 * `:4190`.
 */

// Server-side fetches need an ABSOLUTE origin; the CI build sets
// NEXT_PUBLIC_API_URL to the RELATIVE '/api/v1' (browser-only).
// Strip the suffix and fall back to the co-located backend.
const BACKEND = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4190').replace(/\/api\/v1\/?$/, '') ||
  'http://127.0.0.1:4190';
const ROLE_HEADER = 'x-malapos-role';

/** Map a `/console/*` browser path to the backend path. `auth/*` is a
 *  passthrough (the shared auth router lives at `/api/v1/auth`);
 *  everything else is an admin route under `/api/v1/admin`. */
function backendPath(segments: string[]): string {
  if (segments[0] === 'auth') return segments.join('/');
  return `admin/${segments.join('/')}`;
}

async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  const url = new URL(req.url);
  // The auth kit's /me + /logout resolve the role from the QUERY param
  // (?role=admin), not the role header — stamp it on auth passthroughs
  // so admin-only sessions resolve and logout clears the ADMIN cookie
  // (without it, /me decoded the merchant cookie and admin logout
  // cleared the merchant session).
  const search = new URLSearchParams(url.search);
  if (path[0] === 'auth') search.set('role', 'admin');
  const qs = search.toString();
  const upstream = `${BACKEND}/api/v1/${backendPath(path)}${qs ? `?${qs}` : ''}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    // Keep `cookie` — that is how the backend authenticates the admin.
    // Drop any client-sent role header; we stamp it authoritatively.
    if (
      lower === 'host' ||
      lower === 'content-length' ||
      lower === 'connection' ||
      lower === ROLE_HEADER
    ) {
      return;
    }
    headers.set(key, value);
  });
  headers.set(ROLE_HEADER, 'admin');

  const init: RequestInit = { method: req.method, headers, redirect: 'manual' };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }
  const res = await fetch(upstream, init);

  const outHeaders = new Headers();
  res.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'transfer-encoding' || lower === 'connection') return;
    outHeaders.set(key, value);
  });
  return new Response(res.body, { status: res.status, headers: outHeaders });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
