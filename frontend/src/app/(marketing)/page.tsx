import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Boxes,
  Check,
  ChevronDown,
  CircleDollarSign,
  Hexagon,
  Layers,
  Megaphone,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
  X as XIcon,
  Zap,
} from 'lucide-react';
import { HeroBadge, SectionEyebrow, Price } from '@forjio/website-ui';

/*
 * Forjio family marketing home page.
 *
 * FORKERS: the 9-section STRUCTURE below (Hero → How it works →
 * Features → Pricing → Comparison → Developers → Family → FAQ → CTA)
 * is the locked family standard — every Forjio product's home page
 * has exactly these. Keep the sections; replace the placeholder copy,
 * feature names, pricing, comparison rows, and FAQ with what's
 * actually true of your product. linksnap.com is the reference build.
 */

export default function HomePage() {
  return (
    <>
      {/* ============================================================
          HERO
          ============================================================ */}
      <section className="relative overflow-hidden border-b border-border">
        {/* Brand hero backdrop — off-axis radial + dot grid. Give each
            product its own pattern (see project_forjio_landing_family). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_20%,hsl(var(--primary)/0.18)_0%,transparent_50%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(circle,hsl(var(--border))_1px,transparent_1.5px)] [background-size:24px_24px] opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        />
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-14 md:pt-20 pb-12 md:pb-16">
          <div className="max-w-3xl mx-auto text-center flex flex-col items-center">
            <HeroBadge
              brandIcon={<Hexagon className="size-3 text-primary" strokeWidth={1.5} />}
              primary="Forjio family"
              secondary="One account across every product"
            />

            <h1 className="mt-5 text-[36px] leading-[1.05] md:text-[56px] md:leading-[1.02] font-semibold tracking-[-0.025em]">
              The POS for shops,
              <br />
              cafes &amp;{' '}
              <span className="relative whitespace-nowrap">
                <span className="relative z-10">pharmacies</span>
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-1 h-3 md:h-4 bg-primary/60 dark:bg-primary/30 -z-0 rounded-sm"
                />
              </span>.
            </h1>

            <p className="mt-5 text-[15px] md:text-base leading-relaxed text-muted-foreground max-w-[60ch] mx-auto">
              Ring up sales, track every item of stock, and run multiple outlets from one
              screen. Built for Indonesian retail, F&amp;B, and pharmacy. Priced in rupiah.
              Part of the Forjio family.
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Start free
                <ArrowRight className="size-4" strokeWidth={1.5} />
              </Link>
              <a
                href="#hero-mockup"
                className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-lg text-sm font-medium border border-border bg-card hover:bg-card/80 transition-colors backdrop-blur-sm"
              >
                See the sell screen
              </a>
            </div>
          </div>

          <HeroPreview />
        </div>
      </section>

      {/* ============================================================
          HOW IT WORKS
          ============================================================ */}
      <section className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <SectionEyebrow>How it works</SectionEyebrow>
            <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">
              Open the till and start selling.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground max-w-[52ch]">
              Sign in with your Forjio account, add your products, and ring up the first sale.
              The free plan needs no card.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                num: '01',
                Icon: Settings,
                title: 'Add your catalog',
                body: 'Enter products, variants, and categories — or set F&B modifiers like sugar level and extra shot. Scan a barcode to add an item fast.',
              },
              {
                num: '02',
                Icon: Workflow,
                title: 'Ring up a sale',
                body: 'Search or scan into the cart, then take payment by cash with change, QRIS, or card. Print or share the receipt.',
              },
              {
                num: '03',
                Icon: Activity,
                title: 'Track stock & outlets',
                body: 'Every sale updates live stock. Add more outlets, open and close cashier shifts, and read your sales reports as you grow.',
              },
            ].map(({ num, Icon, title, body }) => (
              <div key={num} className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="inline-flex items-center justify-center size-8 rounded-md bg-primary/10 text-primary text-[12px] font-mono font-semibold">
                    {num}
                  </span>
                  <Icon className="size-4 text-primary" strokeWidth={1.5} />
                </div>
                <h3 className="text-[17px] font-semibold tracking-[-0.01em] mb-2">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          FEATURES
          ============================================================ */}
      <section className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <SectionEyebrow>Features</SectionEyebrow>
            <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">
              Everything Malapos ships.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground max-w-[52ch]">
              Six things your counter actually does every day — all running today, no roadmap fluff.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { Icon: CircleDollarSign, title: 'Sell screen', body: 'Search or scan into the cart and take cash with change, QRIS, or card. Print or share a receipt on the spot.' },
              { Icon: Layers, title: 'Catalog & modifiers', body: 'Products, variants, and categories — plus F&B modifiers like sugar level and extra shot for cafe orders.' },
              { Icon: Boxes, title: 'Inventory', body: 'Live stock levels with an append-only movement ledger, low-stock alerts, manual adjustments, and inter-outlet transfers.' },
              { Icon: ShieldCheck, title: 'Pharmacy batches', body: 'Track dated stock batches, sell first-expiry-first-out, and get alerted before medicine expires.' },
              { Icon: Activity, title: 'Shifts & reports', body: 'Open and close cashier shifts with cash reconciliation. Read sales summaries, top products, and payment-method mix.' },
              { Icon: Zap, title: 'Customers & purchasing', body: 'Earn and redeem loyalty points at the till, and receive supplier purchase orders straight into stock.' },
            ].map(({ Icon, title, body }) => (
              <div key={title} className="rounded-lg border border-border bg-card p-6">
                <div className="size-10 rounded-md flex items-center justify-center bg-primary/10 text-primary mb-4">
                  <Icon className="size-5" strokeWidth={1.5} />
                </div>
                <h3 className="text-[17px] font-semibold tracking-[-0.01em] mb-2">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          PRICING
          ============================================================ */}
      <section id="pricing" className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 pt-16 md:pt-24">
          <div className="text-center max-w-3xl mx-auto">
            <SectionEyebrow>Pricing</SectionEyebrow>
            <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">
              One flat price per store. In rupiah.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground max-w-[62ch] mx-auto">
              Pay per workspace, not per cashier — a flat monthly price in rupiah. Start free,
              then upgrade to Starter, Growth, or Business as your shop grows.
            </p>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 md:px-6 pt-12 pb-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                name: 'Free',
                idr: 0,
                usdCents: 0,
                priceUnit: 'forever',
                who: 'For a single counter getting started.',
                features: ['1 outlet', 'Up to 50 products', 'Cash, QRIS & card', 'Printed & shareable receipts', '2 cashier seats'],
                cta: { label: 'Start free', href: '/signup' },
              },
              {
                name: 'Starter',
                idr: 99_000,
                usdCents: 700,
                priceUnit: '/ month',
                who: 'For one busy store that needs stock + customers.',
                featured: true,
                features: ['Everything in Free', 'Unlimited products', 'Inventory + low-stock alerts', 'Cashier shifts + cash reconciliation', 'Customers + loyalty points', 'Hide Malapos branding', '5 cashier seats'],
                cta: { label: 'Start free', href: '/signup' },
              },
              {
                name: 'Growth',
                idr: 199_000,
                usdCents: 1_400,
                priceUnit: '/ month',
                who: 'For multi-outlet retail, F&B & pharmacy.',
                features: ['Everything in Starter', 'Up to 5 outlets + stock transfers', 'Suppliers + purchase orders', 'Batch & expiry tracking', '15 cashier seats'],
                cta: { label: 'Start free', href: '/signup' },
              },
              {
                name: 'Business',
                idr: 449_000,
                usdCents: 3_000,
                priceUnit: '/ month',
                who: 'For chains running many outlets.',
                features: ['Everything in Growth', 'Unlimited outlets', '50 cashier seats', 'Priority support'],
                cta: { label: 'Start free', href: '/signup' },
              },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-xl border p-5 flex flex-col ${
                  tier.featured ? 'border-primary bg-card shadow-lg shadow-primary/5' : 'border-border bg-card'
                }`}
              >
                {tier.featured && (
                  <span className="absolute -top-2.5 left-5 inline-flex items-center rounded-full bg-primary text-primary-foreground px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    Most popular
                  </span>
                )}
                <h3 className="text-[18px] font-semibold tracking-tight">{tier.name}</h3>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground leading-snug min-h-[40px]">
                  {tier.who}
                </p>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-[28px] font-bold tabular-nums tracking-tight">
                    <Price idr={tier.idr} usdCents={tier.usdCents} />
                  </span>
                  <span className="text-xs text-muted-foreground">{tier.priceUnit}</span>
                </div>
                <ul className="mt-5 space-y-2 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[12.5px] text-foreground/90 leading-[1.4]">
                      <Check className="size-3.5 mt-0.5 shrink-0 text-primary" strokeWidth={2.25} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={tier.cta.href}
                  className={`mt-6 inline-flex items-center justify-center w-full h-9 px-4 rounded-md text-sm font-medium transition-colors ${
                    tier.featured
                      ? 'bg-primary text-primary-foreground hover:opacity-90'
                      : 'bg-card border border-border hover:bg-muted'
                  }`}
                >
                  {tier.cta.label}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          COMPARISON
          ============================================================ */}
      <section className="border-b border-border bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-12 md:py-16">
          <div className="text-center max-w-2xl mx-auto">
            <SectionEyebrow>Compare</SectionEyebrow>
            <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">
              More than a cash register.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground max-w-[60ch] mx-auto">
              A basic cash drawer rings up sales and stops there. A traditional boxed POS does
              more but rarely covers pharmacy or multiple outlets out of the box.
            </p>
          </div>

          <div className="mt-10 overflow-x-auto overflow-y-hidden -mx-4 md:mx-0 rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Capability
                  </th>
                  <th className="px-4 py-3 font-semibold text-primary">Malapos</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Cash register</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Boxed POS</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { cap: 'Cash, QRIS & card at the till', s: true, a: true, b: true },
                  { cap: 'Live inventory + low-stock alerts', s: true, a: false, b: true },
                  { cap: 'Multi-outlet + stock transfers', s: true, a: false, b: false },
                  { cap: 'Batch & expiry tracking (pharmacy)', s: true, a: false, b: false },
                  { cap: 'Customers + loyalty points', s: true, a: false, b: false },
                  { cap: 'Priced in IDR, per workspace', s: true, a: false, b: false },
                ].map((row) => (
                  <tr key={row.cap} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-foreground/90">{row.cap}</td>
                    <Cell value={row.s} highlight />
                    <Cell value={row.a} />
                    <Cell value={row.b} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ============================================================
          FOR DEVELOPERS
          ============================================================ */}
      <section className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16 md:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-start">
            <div>
              <SectionEyebrow>Your numbers</SectionEyebrow>
              <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">
                Your numbers, clear at a glance.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground max-w-[52ch]">
                Every sale and stock movement belongs to your workspace — and Malapos shows it
                back to you in clear, filterable reports built into the dashboard. Know what sold,
                what&apos;s running low, and how the till reconciled.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Sales summary, sales-by-day, and top products',
                  'Payment-method mix and low-stock reports',
                  'An append-only stock movement ledger you can audit',
                  'Filter every report by outlet and date range',
                ].map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-foreground/90 leading-relaxed">
                    <Check className="size-4 mt-0.5 shrink-0 text-primary" strokeWidth={2.25} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground max-w-[52ch]">
                A developer API, integrations, and data export are on the roadmap — they&apos;re
                not live yet, and we won&apos;t pretend otherwise.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Start free
                  <ArrowRight className="size-4" strokeWidth={1.5} />
                </Link>
                <Link
                  href="/features"
                  className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg text-sm font-medium border border-border bg-card hover:bg-muted transition-colors"
                >
                  <Boxes className="size-4" strokeWidth={1.5} />
                  See all features
                </Link>
              </div>
            </div>

            <div className="space-y-4">
              <TerminalCard label="Reports · Sales by day">
                <span className="text-white/40"># date · gross · transactions · top method</span>
                {'\n'}
                <span className="text-white/90">2026-06-01 · 4.820.000 · 142 · QRIS</span>
                {'\n'}
                <span className="text-white/90">2026-06-02 · 3.190.000 · 98 · cash</span>
                {'\n'}
                <span className="text-white/90">2026-06-03 · 5.510.000 · 167 · card</span>
                {'\n\n'}
                <span className="text-white/40"># Filter by outlet and date range</span>
                {'\n'}
                <span className="text-green-300">✔ Last 30 days</span>
              </TerminalCard>

              <TerminalCard label="Inventory · Stock ledger">
                <span className="text-white/40"># item, change, reason, balance</span>
                {'\n'}
                <span className="text-white/90">Kopi Susu 250ml, -1, sale, 47</span>
                {'\n'}
                <span className="text-white/90">Paracetamol 500mg, +200, purchase order, 612</span>
                {'\n'}
                <span className="text-white/90">Beras 5kg, -3, transfer to Outlet 2, 24</span>
                {'\n\n'}
                <span className="text-white/40"># Append-only — every movement is kept</span>
                {'\n'}
                <span className="text-green-300">✔ Full audit history</span>
              </TerminalCard>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          FORJIO FAMILY
          ============================================================ */}
      <section className="border-b border-border bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-12 md:py-16">
          <div className="text-center max-w-3xl mx-auto">
            <SectionEyebrow>One login</SectionEyebrow>
            <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">
              Sign in once. Use every Forjio product.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground max-w-[60ch] mx-auto">
              Malapos shares its account system with the rest of the Forjio family through
              Huudis SSO. Add a cashier here and they sign in with the same Forjio account
              across every product.
            </p>
          </div>

          <div className="mt-12 max-w-2xl mx-auto">
            <div className="rounded-xl border border-border bg-card shadow-sm p-8">
              <div className="flex flex-col items-center">
                <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-primary/10 text-primary border border-primary/20 mb-2">
                  <ShieldCheck className="size-7" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-semibold text-foreground">Huudis</p>
                <p className="text-[11px] font-mono text-muted-foreground mt-0.5">identity</p>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-3">
                {[
                  { name: 'Malapos', icon: Hexagon, current: true, label: 'this product' },
                  { name: 'Storlaunch', icon: Zap, label: 'storefront' },
                  { name: 'Plugipay', icon: CircleDollarSign, label: 'payments' },
                  { name: 'Fulkruma', icon: Boxes, label: 'fulfillment' },
                  { name: 'Ripllo', icon: Megaphone, label: 'marketing' },
                  { name: 'Catentio', icon: Sparkles, label: 'agents' },
                ].map((p) => (
                  <div
                    key={p.name}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 ${
                      p.current
                        ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border bg-card/40'
                    }`}
                  >
                    <p.icon
                      className={`size-5 ${p.current ? 'text-primary' : 'text-muted-foreground'}`}
                      strokeWidth={1.5}
                    />
                    <span className="text-[10.5px] font-medium leading-tight text-center">{p.name}</span>
                    <span className="text-[9px] text-muted-foreground leading-tight text-center">
                      {p.label}
                    </span>
                    {p.current && (
                      <span className="text-[9px] font-mono text-primary">you are here</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-6 text-sm text-muted-foreground text-center">
              Powered by{' '}
              <a href="https://huudis.com" className="text-primary hover:underline font-medium">
                Huudis
              </a>{' '}
              — the identity provider for the Forjio family.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================
          FAQ
          ============================================================ */}
      <section className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <SectionEyebrow>FAQ</SectionEyebrow>
            <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">
              Common questions.
            </h2>
          </div>

          <ul className="mt-10 divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
            {[
              {
                q: 'Is there a free plan?',
                a: 'Yes. The Free plan is free forever — Rp0, no card needed. Paid plans (Starter, Growth, Business) add more outlets, products, cashier seats, and features as your shop grows.',
              },
              {
                q: 'What kind of shops is it for?',
                a: 'Retail, F&B, and pharmacy. Ring up sales by cash, QRIS, or card; set F&B modifiers like sugar level; or track dated medicine batches and sell first-expiry-first-out. Everything is priced in rupiah.',
              },
              {
                q: 'Can I run more than one outlet?',
                a: 'Yes, from the Growth plan up. Manage multiple store locations with per-outlet tax and receipt numbering, and move stock between them with inter-outlet transfers.',
              },
              {
                q: 'Who owns my data?',
                a: 'You do. Sales, stock movements, and reports belong to your workspace, and you can review them anytime in clear in-dashboard reports. Forjio never sells or repackages merchant data.',
              },
              {
                q: 'How do my cashiers sign in?',
                a: 'Through Huudis, the single sign-on shared across the Forjio family. Each plan includes a set number of cashier seats — 2 on Free, up to 50 on Business.',
              },
            ].map((faq) => (
              <li key={faq.q}>
                <details className="group">
                  <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-6 py-5 hover:bg-muted/30 transition-colors [&::-webkit-details-marker]:hidden">
                    <span className="text-[15px] font-medium text-foreground">{faq.q}</span>
                    <ChevronDown
                      className="size-4 text-muted-foreground transition-transform group-open:rotate-180 shrink-0"
                      strokeWidth={1.5}
                    />
                  </summary>
                  <div className="px-6 pb-5 -mt-1 text-sm leading-relaxed text-muted-foreground">
                    {faq.a}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ============================================================
          FOOTER CTA
          ============================================================ */}
      <section className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-16 md:py-20 text-center">
          <div className="flex flex-col items-center">
            <div className="inline-flex items-center justify-center size-12 rounded-xl bg-primary/10 text-primary mb-6">
              <Hexagon className="size-6" strokeWidth={2} />
            </div>
            <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em] max-w-[24ch]">
              Open your till with Malapos today.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground max-w-[52ch]">
              Start free — no card needed. Set up your shop and ring up your first
              sale in minutes.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Start free
                <ArrowRight className="size-4" strokeWidth={1.5} />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg text-sm font-medium border border-border bg-card hover:bg-muted transition-colors"
              >
                Talk to a human
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function Cell({ value, highlight }: { value: boolean | string; highlight?: boolean }) {
  if (typeof value === 'string') {
    return (
      <td
        className={`px-4 py-3 text-center text-[13px] ${
          highlight ? 'font-semibold text-foreground' : 'text-muted-foreground'
        }`}
      >
        {value}
      </td>
    );
  }
  return (
    <td className="px-4 py-3 text-center">
      {value ? (
        <Check
          className={`size-4 mx-auto ${highlight ? 'text-primary' : 'text-foreground/60'}`}
          strokeWidth={2.25}
        />
      ) : (
        <XIcon className="size-4 mx-auto text-muted-foreground/40" strokeWidth={1.5} />
      )}
    </td>
  );
}

// Generic hero mockup — a resource card with a sparkline + stat row.
// Replace with a screenshot or a product-specific mock once you have one.
function HeroPreview() {
  const sparkPoints = [12, 18, 14, 22, 28, 25, 38, 34, 45, 52, 48, 64];
  const max = Math.max(...sparkPoints);
  const sparkPath = sparkPoints
    .map((v, i) => {
      const x = (i / (sparkPoints.length - 1)) * 200;
      const y = 36 - (v / max) * 32;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <div id="hero-mockup" className="mt-12 md:mt-14 max-w-2xl mx-auto">
      <div className="rounded-xl border border-border bg-card shadow-lg shadow-primary/5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5 bg-muted/50">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-red-500/70" />
            <span className="size-2.5 rounded-full bg-amber-400/70" />
            <span className="size-2.5 rounded-full bg-primary/70" />
            <Hexagon className="ml-2 size-3.5 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-[11px] text-muted-foreground font-mono">
              malapos.com / dashboard
            </span>
          </div>
          <MoreHorizontal className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
        </div>

        <div className="p-5">
          <p className="text-[13px] font-semibold text-foreground">Today&apos;s sales</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">A live look at your counter.</p>

          <div className="mt-4">
            <svg
              width="100%"
              height="36"
              viewBox="0 0 200 36"
              preserveAspectRatio="none"
              className="overflow-visible"
            >
              <defs>
                <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${sparkPath} L 200 36 L 0 36 Z`} fill="url(#sparkFill)" />
              <path d={sparkPath} stroke="hsl(var(--primary))" strokeWidth="1.5" fill="none" />
            </svg>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3 text-[11px] font-mono">
            <div>
              <span className="text-muted-foreground uppercase">Sales</span>
              <div className="text-foreground text-[15px] font-semibold tabular-nums">Rp 4,8jt</div>
            </div>
            <div>
              <span className="text-muted-foreground uppercase">Receipts</span>
              <div className="text-foreground text-[15px] font-semibold tabular-nums">142</div>
            </div>
            <div>
              <span className="text-muted-foreground uppercase">Top method</span>
              <div className="text-foreground text-[15px] font-semibold">QRIS</div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground text-center">
        A look at the Malapos dashboard.
      </p>
    </div>
  );
}

function TerminalCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-px rounded-xl bg-gradient-to-br from-primary/20 via-transparent to-transparent dark:from-primary/10 blur-sm"
      />
      <div className="relative rounded-xl border border-slate-900/90 bg-[#0B0F1A] shadow-lg overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-red-500/80" />
            <span className="size-2.5 rounded-full bg-amber-400/80" />
            <span className="size-2.5 rounded-full bg-primary/80" />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-white/50 font-mono">
            <Terminal className="size-3 text-primary" strokeWidth={1.5} />
            {label}
          </div>
          <span className="text-[11px] text-white/30 font-mono">zsh</span>
        </div>
        <pre className="px-4 py-4 text-[12px] leading-[1.7] font-mono whitespace-pre-wrap break-words">
          {children}
        </pre>
      </div>
    </div>
  );
}
