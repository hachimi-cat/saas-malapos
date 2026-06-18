import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { AdminShell } from '@/components/admin-shell';
import type { SessionUser } from '@forjio/portal-ui';

/*
 * Admin portal route-group layout — the admin auth gate. Mirrors the
 * merchant `(dashboard)/layout.tsx`, with three differences:
 *
 *   1. It gates on the admin session cookie (`malapos_admin_session`),
 *      not the merchant one.
 *   2. It stamps the role header (`X-Forjio-Brand-Role: admin`) on the
 *      `/auth/me` call so the shared auth-server kit resolves the
 *      *admin* role session.
 *   3. On failure it bounces to `/admin/login`, not `/login`.
 *
 * The `(portal)` route group wraps the authenticated admin pages
 * (`/admin/dashboard`, and any per-product admin pages added later)
 * WITHOUT adding a URL segment, so the gate sits above all of them
 * while `/admin/login`, `/admin/forgot-password` and
 * `/admin/reset-password` stay public.
 *
 * The security boundary is the backend `gate` in auth-config.ts: a
 * Huudis account that is not an owner/admin of this product's Huudis
 * workspace can never mint an `admin` session, so even a bypass of
 * this layout would still be rejected by every `/api/v1/admin/*` route
 * (guarded by `adminGuard`).
 *
 * rename.sh rewrites the `malapos` slug.
 */

const ADMIN_SESSION_COOKIE = 'malapos_admin_session';
const ROLE_HEADER = 'x-malapos-role';
// Server-side fetches need an ABSOLUTE origin; the CI build sets
// NEXT_PUBLIC_API_URL to the RELATIVE '/api/v1' (browser-only).
// Strip the suffix and fall back to the co-located backend.
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4191').replace(/\/api\/v1\/?$/, '') ||
  'http://127.0.0.1:4191';

async function fetchAdminUser(cookieHeader: string): Promise<SessionUser | null> {
  try {
    // NOTE: the auth kit's /me resolves the role from the QUERY param
    // (?role=admin), not the role header — without it the gate decodes
    // the MERCHANT cookie, so an admin-only session bounces to login
    // (and a dual-session user silently passes on the WRONG session).
    const res = await fetch(`${API_ORIGIN}/api/v1/auth/me?role=admin`, {
      headers: { cookie: cookieHeader, [ROLE_HEADER]: 'admin' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    // /api/v1/auth/me comes from @forjio/sdk/auth-server — identity is
    // nested under `user`, with the accountId exposed as `user.id`.
    const body = (await res.json()) as {
      data?: { user?: { id?: string; name?: string; email?: string } };
    };
    const u = body.data?.user;
    if (!u?.email || !u.id) return null;
    return { name: u.name ?? u.email, email: u.email };
  } catch {
    return null;
  }
}

export default async function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  if (!jar.get(ADMIN_SESSION_COOKIE)) {
    redirect('/admin/login');
  }

  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const user = await fetchAdminUser(cookieHeader);

  // Cookie present but the session didn't resolve (expired / revoked /
  // signing-key change) — send them back through admin login.
  if (!user) {
    redirect('/admin/login');
  }

  return <AdminShell user={user}>{children}</AdminShell>;
}
