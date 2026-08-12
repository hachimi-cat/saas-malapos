'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  LifeBuoy,
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
  Wallet,
  ChefHat,
  Gift,
  Building2,
  BookOpen,
  FileText,
  Shield,
  KeyRound,
  Webhook,
  ScrollText,
  Puzzle,
  Receipt,
  Landmark,
  Ticket,
  MapPin,
  Layers,
  RefreshCcw,
  BookOpenCheck,
  Zap,
  ShoppingBag,
  Loader2,
  Download,
  KeySquare,
  Warehouse,
  UserSearch,
  FileSignature,
  Network,
  UserCheck,
  Inbox,
  Radio,
  PenSquare,
  Filter,
  Share2,
  ShoppingCart,
  Crosshair,
  Rss,
  Newspaper,
  Utensils,
  Hand,
  SlidersHorizontal,
  Tag,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import {
  MobileHeader,
  Sidebar,
  readActiveWorkspaceId,
  type PortalWorkspace,
  type SessionUser,
  type NavSection,
  type NavModule,
} from '@forjio/portal-ui';
import { LogoMark } from '@/components/brand/logo';
import {
  useModules,
  type ModulesState,
  isPaymentGatedPath,
  isFulfillmentGatedPath,
  isMarketingGatedPath,
} from '@/hooks/use-modules';
import { useBusinessType } from '@/hooks/use-business-type';
import {
  useAssistantActivity,
  useCatentioCredits,
  useCatentioStatus,
} from '@/hooks/use-catentio';
import { CatentioDockedChat } from '@/components/catentio/docked-chat';

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

// Static (always-on) nav — everything except the module-gated "Modules"
// section, which is assembled per-merchant in the host below. The flat
// Payments / Delivery / Marketing items that used to live under
// Operations now ship as gated accordions in the Modules section.
const STATIC_SECTIONS: NavSection[] = [
  {
    label: 'Sell',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/dashboard/sell', label: 'Sell', icon: ScanLine },
      { href: '/dashboard/sales', label: 'Sales', icon: BarChart3 },
      { href: '/dashboard/shifts', label: 'Shifts', icon: Clock },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { href: '/dashboard/products', label: 'Products', icon: Package },
      { href: '/dashboard/categories', label: 'Categories', icon: Tag },
      { href: '/dashboard/modifiers', label: 'Modifiers', icon: SlidersHorizontal },
      { href: '/dashboard/inventory', label: 'Inventory', icon: Boxes },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/dashboard/purchasing', label: 'Purchasing', icon: Truck },
      { href: '/dashboard/customers', label: 'Customers', icon: Users },
      { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
];

const TRAILING_SECTIONS: NavSection[] = [
  {
    label: 'Developer',
    items: [
      { href: '/dashboard/api-keys', label: 'API Keys', icon: KeyRound },
      { href: '/dashboard/webhooks', label: 'Webhooks', icon: Webhook },
      { href: '/dashboard/audit-log', label: 'Audit Log', icon: ScrollText },
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

// ── Partner-module accordions ────────────────────────────────────────
// The three collapsible module accordions in the "Modules" section, each
// gated by the `ModulesState` flag below. portal-ui renders the
// accordions + handles active-highlight/auto-expand internally — the host
// only filters which modules reach <Sidebar>. Sub-pages are grounded in
// the real backend routes (/payments/*, /fulfillment/*, /marketing/*).
const PAYMENTS_MODULE: NavModule = {
  label: 'Payment',
  icon: Wallet,
  groups: [
    {
      items: [
        { href: '/dashboard/payments', label: 'Checkout Sessions', icon: CreditCard },
        { href: '/dashboard/payments/plans', label: 'Plans', icon: Layers },
        { href: '/dashboard/payments/subscriptions', label: 'Subscriptions', icon: RefreshCcw },
        { href: '/dashboard/payments/invoices', label: 'Invoices', icon: Receipt },
        { href: '/dashboard/payments/receipts', label: 'Receipts', icon: Receipt },
        { href: '/dashboard/payments/customers', label: 'Customers', icon: Users },
        { href: '/dashboard/payments/gift-cards', label: 'Gift cards', icon: Gift },
      ],
    },
    {
      label: 'Money',
      items: [
        { href: '/dashboard/payments/payouts', label: 'Payouts', icon: Landmark },
        { href: '/dashboard/payments/ledger', label: 'Ledger', icon: BookOpenCheck },
        { href: '/dashboard/payments/reports', label: 'Reports', icon: BarChart3 },
      ],
    },
    {
      label: 'Settings',
      items: [
        { href: '/dashboard/payments/settings/providers', label: 'Providers', icon: Zap },
        { href: '/dashboard/payments/settings/payment-methods', label: 'Payment methods', icon: ShoppingBag },
        { href: '/dashboard/payments/settings/templates', label: 'Templates', icon: FileText },
      ],
    },
  ],
};

const FULFILLMENT_MODULE: NavModule = {
  label: 'Fulfillment',
  icon: Send,
  groups: [
    {
      label: 'Digital',
      items: [
        { href: '/dashboard/fulfillment/deliveries', label: 'Digital deliveries', icon: Download },
        { href: '/dashboard/fulfillment/licenses', label: 'Licenses', icon: KeySquare },
      ],
    },
    {
      label: 'Physical',
      items: [
        { href: '/dashboard/fulfillment/shipments', label: 'Shipments', icon: Truck },
        { href: '/dashboard/fulfillment/shipping-credits', label: 'Shipping Credits', icon: Wallet },
        { href: '/dashboard/fulfillment/inventory', label: 'Inventory', icon: Boxes },
        { href: '/dashboard/fulfillment/warehouses', label: 'Warehouses', icon: Warehouse },
        { href: '/dashboard/fulfillment/shipping', label: 'Shipping', icon: MapPin },
      ],
    },
  ],
};

const MARKETING_MODULE: NavModule = {
  label: 'Marketing',
  icon: Megaphone,
  groups: [
    {
      label: 'Campaigns',
      items: [{ href: '/dashboard/marketing/campaigns', label: 'All campaigns', icon: Megaphone }],
    },
    {
      label: 'Marketplace',
      items: [
        { href: '/dashboard/marketing/creators', label: 'Creators', icon: UserSearch },
        { href: '/dashboard/marketing/creator-briefs', label: 'Creator briefs', icon: FileText },
        { href: '/dashboard/marketing/contracts', label: 'Contracts', icon: FileSignature },
        { href: '/dashboard/marketing/programs', label: 'Affiliate programs', icon: Network },
        { href: '/dashboard/marketing/affiliate-approvals', label: 'Affiliate approvals', icon: UserCheck },
      ],
    },
    {
      label: 'Channels & Audience',
      items: [
        { href: '/dashboard/marketing/inbox', label: 'Inbox', icon: Inbox },
        { href: '/dashboard/marketing/audience', label: 'Audience', icon: Users },
        { href: '/dashboard/marketing/channels', label: 'Channels', icon: Radio },
        { href: '/dashboard/marketing/compose', label: 'Compose', icon: PenSquare },
        { href: '/dashboard/marketing/funnels', label: 'Funnels', icon: Filter },
      ],
    },
    {
      label: 'Growth',
      items: [
        { href: '/dashboard/marketing/discount-codes', label: 'Discount codes', icon: Ticket },
        { href: '/dashboard/marketing/referrals', label: 'Referrals', icon: Share2 },
        { href: '/dashboard/marketing/abandoned-cart', label: 'Abandoned cart', icon: ShoppingCart },
        { href: '/dashboard/marketing/loyalty', label: 'Loyalty program', icon: Gift },
      ],
    },
    {
      label: 'Storefront',
      items: [
        { href: '/dashboard/marketing/pixels', label: 'Pixels & tracking', icon: Crosshair },
        { href: '/dashboard/marketing/feeds', label: 'Product feeds', icon: Rss },
        { href: '/dashboard/marketing/blog', label: 'Blog', icon: Newspaper },
      ],
    },
  ],
};

// Each module accordion paired with the ModulesState flag that gates its
// visibility. The host strips out the ones the merchant has off.
const GATED_MODULES: { module: NavModule; key: keyof ModulesState }[] = [
  { module: PAYMENTS_MODULE, key: 'payment' },
  { module: FULFILLMENT_MODULE, key: 'fulfillment' },
  { module: MARKETING_MODULE, key: 'marketing' },
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

  // Embedded catentio assistant — flag-gated per user; flag off =
  // sidebar + column unchanged. The chip math is linksnap's
  // (credits-meter-must-read-plan-limit-not-ledger): fill = consumed
  // share of the LARGER of the monthly grant and everything the wallet
  // actually had this period, so a seeded/topped-up wallet never reads
  // "94% used" beside a four-figure balance.
  const { enabled: assistantEnabled } = useCatentioStatus();
  const { credits, refresh: refreshCredits } = useCatentioCredits(assistantEnabled);
  // A run that just finished has already been billed — the chip must
  // show it without a reload. Refresh immediately AND once more shortly
  // after, in case our read beat the meter's write.
  useAssistantActivity(() => {
    refreshCredits();
    const timer = setTimeout(refreshCredits, 2500);
    return () => clearTimeout(timer);
  });
  const chipCredits = useMemo(() => {
    if (!credits) return null;
    const balance = credits.balance.credits;
    const period = new Date().toISOString().slice(0, 7);
    const used =
      credits.balance.used_this_period_credits ??
      credits.ledger
        .filter(
          (r) =>
            r.kind === 'embedded_agent_usage' &&
            r.credits < 0 &&
            (r.at ?? '').slice(0, 7) === period,
        )
        .reduce((a, r) => a + -r.credits, 0);
    const grant = credits.balance.monthly_grant_credits ?? 0;
    const limit = Math.max(grant, Math.max(balance, 0) + used);
    const now = new Date();
    const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const date = reset.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const time = reset.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return {
      credits: balance,
      grantCredits: limit,
      usedFraction: limit > 0 ? Math.min(1, used / limit) : 0,
      caption: `Resets ${date}, ${time}`,
      href: '/dashboard/billing/credits',
    };
  }, [credits]);
  const router = useRouter();
  const pathname = usePathname();
  const { modules, loading: modulesLoading } = useModules();
  // F&B + pharmacy both have a prep step + a serve hand-off board; retail/
  // general have neither.
  const { isFnb, businessType } = useBusinessType();
  const isPharmacy = businessType === 'PHARMACY';
  const showPrepBoards = isFnb || isPharmacy;

  // Nav badges: live counts of orders waiting on the serve board + active
  // kitchen tickets, polled while the prep boards are in the nav.
  const [kdsCounts, setKdsCounts] = useState<{ active: number; ready: number }>({ active: 0, ready: 0 });
  useEffect(() => {
    if (!showPrepBoards) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.get<{ active: number; ready: number }>('/kds/counts');
        if (!cancelled) setKdsCounts({ active: res.data.active ?? 0, ready: res.data.ready ?? 0 });
      } catch {
        /* non-fatal — badges just stay hidden */
      }
    };
    load();
    const t = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [showPrepBoards]);

  // Route guard: typing a gated module URL while the module is off bounces
  // the merchant to the Modules settings page. Lives here (not the
  // server-component layout) because useModules is client-side. Mirrors
  // storlaunch's layout guard.
  useEffect(() => {
    if (modulesLoading) return;
    if (isPaymentGatedPath(pathname) && modules.payment !== true) {
      router.replace('/dashboard/settings/modules?gated=payment');
    } else if (isFulfillmentGatedPath(pathname) && modules.fulfillment !== true) {
      router.replace('/dashboard/settings/modules?gated=fulfillment');
    } else if (isMarketingGatedPath(pathname) && modules.marketing !== true) {
      router.replace('/dashboard/settings/modules?gated=marketing');
    }
  }, [modulesLoading, modules.payment, modules.fulfillment, modules.marketing, pathname, router]);

  // Host-side module gating: keep only the accordions the merchant has
  // enabled. portal-ui renders what it is given.
  const enabledModules = GATED_MODULES.filter(({ key }) => modules[key] === true).map(
    ({ module }) => module,
  );

  // Operations nav extras by business type: F&B gets dine-in Tables; F&B +
  // pharmacy get the prep board (Kitchen / Preparation display) and the Serve
  // display hand-off board. Retail/general get none of these.
  const opsExtras = [
    ...(isFnb ? [{ href: '/dashboard/tables', label: 'Tables', icon: Utensils }] : []),
    ...(showPrepBoards
      ? [
          { href: '/dashboard/serve', label: 'Serve display', icon: Hand, ...(kdsCounts.ready > 0 ? { badge: kdsCounts.ready } : {}) },
          {
            href: '/dashboard/kds',
            label: isPharmacy ? 'Preparation display' : 'Kitchen display',
            icon: ChefHat,
            ...(kdsCounts.active > 0 ? { badge: kdsCounts.active } : {}),
          },
        ]
      : []),
  ];
  const staticSections: NavSection[] = STATIC_SECTIONS.map((section) =>
    section.label === 'Operations'
      ? { ...section, items: [...opsExtras, ...(section.items ?? [])] }
      : section,
  );

  const sections: NavSection[] = [
    ...staticSections,
    ...(enabledModules.length > 0 ? [{ label: 'Modules', modules: enabledModules }] : []),
    ...TRAILING_SECTIONS,
  ];

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

  // Suppress the brief window where a gated sub-page mounts + fires its
  // module-scoped fetches before the redirect effect lands — without this
  // e.g. /dashboard/payments would burst a 409 before the bounce kicks in.
  const isGatedAndDisallowed =
    !modulesLoading &&
    ((isPaymentGatedPath(pathname) && modules.payment !== true) ||
      (isFulfillmentGatedPath(pathname) && modules.fulfillment !== true) ||
      (isMarketingGatedPath(pathname) && modules.marketing !== true));

  return (
    // h-dvh + overflow-hidden, NOT minHeight 100vh: the docked assistant
    // anchors to the content column, so the column has to be exactly
    // viewport height or the dock lands below the fold on any page taller
    // than the screen. Scrolling moves into <main>. linksnap is the
    // reference; storlaunch measured the bug (top 730 in a 720 viewport).
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        brandSlug={BRAND_SLUG}
        brandName={BRAND}
        brandColor={BRAND_COLOR}
        brandColorSoft={BRAND_COLOR_SOFT}
        brandIcon={<LogoMark size={20} />}
        workspacePersist="cookie"
        workspaces={workspaces}
        activeWorkspaceId={activeId}
        sections={sections}
        credits={chipCredits}
        dropdownLinks={DROPDOWN_LINKS}
        user={user}
        onLogout={logout}
        open={open}
        onClose={() => setOpen(false)}
      />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile island header (phones) — the workspace-selector pill
            + round burger that opens the Sidebar drawer. Hidden on lg+. */}
        <MobileHeader
          brandSlug={BRAND_SLUG}
          brandName={BRAND}
          brandColor={BRAND_COLOR}
          brandColorSoft={BRAND_COLOR_SOFT}
          brandIcon={<LogoMark size={20} />}
          workspacePersist="cookie"
          workspaces={workspaces}
          activeWorkspaceId={activeId}
          onMenuOpen={() => setOpen(true)}
        />
        {/* `overflow-y-auto` is load-bearing, not decoration: the column
            above is `overflow-hidden` so the dock can anchor to the
            viewport-height column instead of the page. Without a scroller
            here, anything taller than the viewport is CLIPPED rather than
            scrolled. The pb reserve keeps the last row clear of the
            resting dock. */}
        <main
          className={`min-w-0 flex-1 overflow-y-auto p-4 md:p-6 ${
            assistantEnabled ? 'pb-52 md:pb-52' : ''
          }`}
        >
          {/* Single source of the page content width — every dashboard page
              is centered at the same max-width here, so pages must NOT set
              their own `mx-auto max-w-*` root container (would double-constrain
              and look inconsistent). */}
          {modulesLoading || isGatedAndDisallowed ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          )}
        </main>
        {/* Embedded catentio agent — the docked chat. Inside the content
            column so it centers on the CONTENT (sidebar excluded).
            Renders nothing unless the pilot flag says so (the backend
            re-checks anyway). This was imported but never mounted, which
            is why the assistant was invisible on malapos. */}
        <CatentioDockedChat />
      </div>
    </div>
  );
}
