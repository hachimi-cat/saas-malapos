import type { ReactNode } from 'react';

/*
 * (admin) is a route group — it does not add a URL segment. Only the
 * authenticated admin pages under `(admin)/admin/(portal)/` enforce
 * the gate (via that nested layout). `/admin/login`,
 * `/admin/forgot-password` and `/admin/reset-password` render through
 * this passthrough, so they stay public — an admin who is signed out
 * can still reach the login surface.
 */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
