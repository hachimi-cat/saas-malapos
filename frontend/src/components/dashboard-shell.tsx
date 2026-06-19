'use client';

import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  LifeBuoy,
  Menu,
  ScanLine,
  Package,
  Boxes,
  Users,
  Truck,
  Send,
  Megaphone,
  BarChart3,
  Settings,
  Store,
  CreditCard,
  ChefHat,
  Gift,
  Building2,
  BookOpen,
  FileText,
  Shield,
  KeyRound,
  Webhook,
  Puzzle,
  type LucideIcon,
} from 'lucide-react';
import {
  Sidebar,
  readActiveWorkspaceId,
  type PortalWorkspace,
  type SessionUser,
  type NavSection,
} from '@forjio/portal-ui';
import { LogoMark } from '@/components/brand/logo';

/*
 * Dashboard shell — the authenticated portal chrome. `@forjio/portal-ui`
 * Sidebar renders the workspace switcher, nav, and profile dropdown;
 * the host (this file) supplies the workspace list, active id, nav
 * sections, user, the mobile-drawer open state, and the logout handler.
 *
 * FORKERS: add your portal pages as `SECTIONS` entries below. Keep
 * "Overview → Dashboard" first. Workspace persistence is `cookie` —
 * the family canon; do not switch to localStorage.
 */

// rename.sh rewrites "Malapos" / "malapos". Brand color
// follows the theme's `--primary` token (set in app/globals.css) —
// the pawpado role-shell convention — so retuning the token rebrands
// the shell too; don't hardcode a hex here.
const BRAND = 'Malapos';
const BRAND_SLUG = 'malapos';
const BRAND_COLOR = 'hsl(var(--primary))';
const BRAND_COLOR_SOFT = 'hsl(var(--primary) / 0.15)';

// Hosted Suppuo support portal for this product's Suppuo workspace — the
// family helpdesk entry point (ticket history + live chat). Handle = brand
// slug (Suppuo resolves slug-or-acc); rename.sh rewrites `malapos`.
const SUPPORT_URL = 'https://suppuo.com/portal/malapos';

// Profile-dropdown links (portal-ui `dropdownLinks`). Passing this overrides
// the portal-ui defaults, so the standard Documentation/Terms/Privacy links
// are re-declared here alongside Support — which lives in the profile menu
// (not the nav) per the family chrome convention.
const DROPDOWN_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/docs', label: 'Documentation', icon: BookOpen },
  { href: '/terms', label: 'Terms of Service', icon: FileText },
  { href: '/privacy', label: 'Privacy Policy', icon: Shield },
  { href: SUPPORT_URL, label: 'Support', icon: LifeBuoy },
];

const SECTIONS: NavSection[] = [
  {
    label: 'Sell',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/dashboard/sell', label: 'Sell', icon: ScanLine },
      { href: '/dashboard/sales', label: 'Sales', icon: BarChart3 },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { href: '/dashboard/products', label: 'Products', icon: Package },
      { href: '/dashboard/inventory', label: 'Inventory', icon: Boxes },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/dashboard/kds', label: 'Kitchen display', icon: ChefHat },
      { href: '/dashboard/delivery', label: 'Delivery', icon: Send },
      { href: '/dashboard/marketing', label: 'Marketing', icon: Megaphone },
      { href: '/dashboard/purchasing', label: 'Purchasing', icon: Truck },
      { href: '/dashboard/customers', label: 'Customers', icon: Users },
      { href: '/dashboard/gift-cards', label: 'Gift cards', icon: Gift },
      { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Developer',
    items: [
      { href: '/dashboard/api-keys', label: 'API Keys', icon: KeyRound },
      { href: '/dashboard/webhooks', label: 'Webhooks', icon: Webhook },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard/outlets', label: 'Outlets', icon: Store },
      { href: '/dashboard/workspaces', label: 'Workspaces', icon: Building2 },
      { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
      { href: '/dashboard/settings/modules', label: 'Modules', icon: Puzzle },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
];

async function logout() {
  try {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    /* clear client state regardless */
  }
  window.location.href = '/login';
}

export function DashboardShell({
  user,
  accountId,
  children,
}: {
  user: SessionUser;
  /** The user's own derived account id, from /auth/me. Used as the
   *  fallback workspace until a product wires a real workspace list. */
  accountId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // The user always has at least their own account — so the switcher
  // shows a real name even before a product ships /account/workspaces.
  const fallback: PortalWorkspace = {
    id: accountId,
    name: user?.name ? `${user.name}'s workspace` : 'My workspace',
    role: 'owner',
  };
  const [workspaces, setWorkspaces] = useState<PortalWorkspace[]>([fallback]);
  const [activeId, setActiveId] = useState<string>(accountId);

  useEffect(() => {
    const cookieId = readActiveWorkspaceId('cookie', BRAND_SLUG);
    // Real Huudis workspaces via the IAM proxy (routes/huudis-proxy → Huudis
    // /account/workspaces). The personal-account fallback always leads so the
    // switcher works even for a user with no extra workspaces.
    fetch('/api/v1/huudis/account/workspaces', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        const raw = (b?.data ?? []) as Array<{ id: string; name: string; role?: string }>;
        const huudis: PortalWorkspace[] = raw.map((w) => ({
          id: w.id,
          name: w.name,
          role: (w.role ?? 'member') as PortalWorkspace['role'],
        }));
        const ws = [fallback, ...huudis.filter((w) => w.id !== fallback.id)];
        setWorkspaces(ws);
        setActiveId(cookieId && ws.some((w) => w.id === cookieId) ? cookieId : ws[0].id);
      })
      .catch(() => {
        if (cookieId) setActiveId(cookieId);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        brandSlug={BRAND_SLUG}
        brandName={BRAND}
        brandColor={BRAND_COLOR}
        brandColorSoft={BRAND_COLOR_SOFT}
        brandIcon={<LogoMark size={20} />}
        workspacePersist="cookie"
        workspaces={workspaces}
        activeWorkspaceId={activeId}
        sections={SECTIONS}
        dropdownLinks={DROPDOWN_LINKS}
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
