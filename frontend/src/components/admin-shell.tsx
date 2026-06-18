'use client';

import { useState } from 'react';
import { LayoutDashboard, Menu, Users } from 'lucide-react';
import { Sidebar, type SessionUser, type NavSection } from '@forjio/portal-ui';
import { LogoMark } from '@/components/brand/logo';

/*
 * Admin portal shell — the authenticated chrome for the built-in admin
 * console. Mirrors `dashboard-shell.tsx` (the merchant portal chrome)
 * but runs the `@forjio/portal-ui` Sidebar in **no-workspace mode**:
 * the `workspaces` / `activeWorkspaceId` / `workspacePersist` props are
 * omitted, so no workspace switcher is rendered — admins have no
 * per-workspace concept, they administer the whole product.
 *
 * `brandTag="Admin"` renders a small uppercase "Admin" subtitle under
 * the brand name, so the admin portal is visually distinct from the
 * merchant dashboard.
 *
 * FORKERS: add your admin pages as `SECTIONS` entries below — keep
 * "Overview → Dashboard" first. rename.sh rewrites "Malapos" /
 * "malapos".
 */

// rename.sh rewrites these placeholders. Brand color follows the
// theme's `--primary` token (the pawpado role-shell convention) —
// don't hardcode a hex here.
const BRAND = 'Malapos';
const BRAND_SLUG = 'malapos';
const BRAND_COLOR = 'hsl(var(--primary))';
const BRAND_COLOR_SOFT = 'hsl(var(--primary) / 0.15)';

const SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [{ href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Customers',
    items: [{ href: '/admin/customers', label: 'Customers', icon: Users }],
  },
  // Products add their own admin sections here, e.g.:
  // { label: 'Review', items: [{ href: '/admin/kyc', label: 'KYC', icon: ShieldCheck }] },
];

async function logout() {
  try {
    // The admin role's session cookie is resolved by the role header
    // the admin BFF proxy stamps — logout goes through the same proxy.
    await fetch('/api/v1/console/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    /* clear client state regardless */
  }
  window.location.href = '/admin/login';
}

export function AdminShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        brandSlug={BRAND_SLUG}
        brandName={BRAND}
        brandTag="Admin"
        brandHref="/admin/dashboard"
        brandColor={BRAND_COLOR}
        brandColorSoft={BRAND_COLOR_SOFT}
        brandIcon={<LogoMark size={20} />}
        sections={SECTIONS}
        user={user}
        onLogout={logout}
        open={open}
        onClose={() => setOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar — the Sidebar drawer has no open trigger of
            its own, so the host renders one. Hidden on lg+. */}
        <div className="flex h-14 items-center border-b border-border bg-card px-4 lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-foreground">
            <Menu className="h-5 w-5" />
          </button>
        </div>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
