import Script from 'next/script';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { DashboardShell } from '@/components/dashboard-shell';
import type { SessionUser } from '@forjio/portal-ui';

/*
 * Dashboard route-group layout — the auth gate. No session cookie →
 * bounce to /login. With one, resolve the user via the backend's
 * /auth/me and hand it to the portal shell.
 *
 * Cookie name is `malapos_session` (rename.sh rewrites the
 * `malapos` slug).
 */

const SESSION_COOKIE = 'malapos_session';
// Server-side fetches need an ABSOLUTE origin; the CI build sets
// NEXT_PUBLIC_API_URL to the RELATIVE '/api/v1' (browser-only) and Node
// fetch throws on relative URLs — which bounced every real login.
// Strip the suffix and fall back to the co-located backend.
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4190').replace(/\/api\/v1\/?$/, '') ||
  'http://127.0.0.1:4190';

type Resolved = { user: SessionUser; accountId: string };

async function fetchCurrentUser(cookieHeader: string): Promise<Resolved | null> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/v1/auth/me`, {
      headers: { cookie: cookieHeader },
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
    return {
      user: { name: u.name ?? u.email, email: u.email },
      accountId: u.id,
    };
  } catch {
    return null;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  if (!jar.get(SESSION_COOKIE)) {
    redirect('/login?return_to=/dashboard');
  }

  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const resolved = await fetchCurrentUser(cookieHeader);

  // Cookie present but the session didn't resolve (expired / signing-key
  // change) — send them back through login to mint a fresh one.
  if (!resolved) {
    redirect('/login?return_to=/dashboard');
  }

  return (
    <DashboardShell user={resolved.user} accountId={resolved.accountId}>
      {children}
      {/* Suppuo helpdesk widget — live chat in the authenticated portal too
          (matches the family; the bubble follows the workspace brand accent).
          Handle = brand slug; rename.sh rewrites `malapos`. */}
      <Script
        src="https://suppuo.com/widget.js"
        data-suppuo-account="malapos"
        strategy="afterInteractive"
      />
    </DashboardShell>
  );
}
