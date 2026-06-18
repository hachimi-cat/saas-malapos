import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CircleDollarSign,
  Layers,
  Boxes,
  ShieldCheck,
  Users,
  Activity,
  ArrowRight,
} from 'lucide-react';

/*
 * FORKERS: replace the placeholder feature copy with what Malapos
 * actually ships. Keep the structure (centered hero → 2-col grid →
 * CTA) — it's the family standard.
 */

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Everything Malapos ships — a point-of-sale for Indonesian retail, F&B, and pharmacy. Sell, track stock, and run multiple outlets, priced in rupiah.',
};

const features = [
  {
    Icon: CircleDollarSign,
    title: 'Sell screen',
    body: 'Ring up a sale fast. Search or scan into the cart and take payment however your customer pays.',
    details: [
      'Cash with automatic change, QRIS, or card',
      'Barcode scan-to-add',
      'Printed and shareable receipts',
      'F&B modifiers like sugar level and extra shot',
    ],
  },
  {
    Icon: Layers,
    title: 'Catalog',
    body: 'Build your menu or shelf once. Organise products with variants and categories that show up on the sell screen.',
    details: [
      'Products, variants, and categories',
      'Per-product pricing',
      'Modifiers for F&B orders',
      'Works for retail, cafe, and pharmacy items',
    ],
  },
  {
    Icon: Boxes,
    title: 'Inventory',
    body: 'Track every item of stock. Each sale, adjustment, and transfer is recorded so your counts always add up.',
    details: [
      'Live stock levels',
      'Append-only stock movement ledger',
      'Low-stock alerts and manual adjustments',
      'Inter-outlet stock transfers',
    ],
  },
  {
    Icon: ShieldCheck,
    title: 'Pharmacy',
    body: 'Track every strip and bottle. Sell by expiry so the soonest-to-expire stock leaves first.',
    details: [
      'Dated stock batches',
      'First-expiry-first-out selling',
      'Expiry alerts before medicine lapses',
      'Built alongside retail and F&B',
    ],
  },
  {
    Icon: Activity,
    title: 'Outlets, shifts & reports',
    body: 'Run more than one store and keep the till honest. Close every shift against the cash drawer and read what sold.',
    details: [
      'Multiple outlets with per-outlet tax and receipt numbering',
      'Cashier shifts with cash reconciliation',
      'Sales summary, sales-by-day, and top products',
      'Payment-method mix and low-stock reports',
    ],
  },
  {
    Icon: Users,
    title: 'Customers & purchasing',
    body: 'Keep regulars coming back and shelves stocked. Reward loyalty at the till and receive supplier deliveries into stock.',
    details: [
      'Customer directory with loyalty points',
      'Earn on sale, adjust or redeem by hand',
      'Suppliers and purchase orders',
      'Receive goods to stock-in and update cost',
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 md:px-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Everything your counter needs.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Malapos is a point-of-sale for Indonesian retail, F&amp;B, and pharmacy. Sell on the
          Free plan today; unlock inventory, customers, multi-outlet, and pharmacy batches as
          your shop grows. Priced in rupiah.
        </p>
      </div>

      <div className="mt-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {features.map(({ Icon, title, body, details }) => (
            <article key={title} className="rounded-xl border border-border bg-card p-6 md:p-8">
              <div className="mb-5 flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-6" strokeWidth={1.5} />
              </div>
              <h2 className="text-xl font-semibold tracking-[-0.01em]">{title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                {details.map((d) => (
                  <li key={d} className="flex items-start gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-primary/60" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-20 text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Start free — no card required.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Start on the Free plan — Rp0, no card needed — and upgrade as your shop grows. Set up
          your shop and ring up your first sale in minutes.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start free <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
          >
            View pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
