import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { Price } from '@forjio/website-ui';

/*
 * Pricing mirrors backend/src/lib/billing.ts (TIER_DEFS) — the single
 * source of truth for plan limits + bullets. Four flat per-workspace
 * monthly IDR tiers: Free / Starter / Growth / Business. Free is Rp0
 * with no card; the paid tiers add outlets, products, and features.
 */

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'One flat price per store, in rupiah. Start free, then Starter, Growth, and Business plans for Indonesian retail, F&B, and pharmacy.',
};

const tiers = [
  { name: 'Free',     idr: 0,       usdCents: 0,     description: 'For a single counter getting started.',       cta: 'Start free', highlight: false },
  { name: 'Starter',  idr: 99_000,  usdCents: 700,   description: 'For one busy store that needs stock + customers.', cta: 'Start free', highlight: true  },
  { name: 'Growth',   idr: 199_000, usdCents: 1_400, description: 'For multi-outlet retail, F&B & pharmacy.',     cta: 'Start free', highlight: false },
  { name: 'Business', idr: 449_000, usdCents: 3_000, description: 'For chains running many outlets.',            cta: 'Start free', highlight: false },
];

const comparisonRows = [
  { feature: 'Outlets (store locations)', free: '1', starter: '1', growth: '5', business: 'Unlimited' },
  { feature: 'Products', free: 'Up to 50', starter: 'Unlimited', growth: 'Unlimited', business: 'Unlimited' },
  { feature: 'Cashier seats', free: '2', starter: '5', growth: '15', business: '50' },
  { feature: 'Sell screen — cash, QRIS & card', free: true, starter: true, growth: true, business: true },
  { feature: 'Printed & shareable receipts', free: true, starter: true, growth: true, business: true },
  { feature: 'Inventory + low-stock alerts', free: false, starter: true, growth: true, business: true },
  { feature: 'Cashier shifts + cash reconciliation', free: false, starter: true, growth: true, business: true },
  { feature: 'Customers + loyalty points', free: false, starter: true, growth: true, business: true },
  { feature: 'Full sales reports', free: 'Daily only', starter: true, growth: true, business: true },
  { feature: 'Multi-outlet + stock transfers', free: false, starter: false, growth: true, business: true },
  { feature: 'Suppliers + purchase orders', free: false, starter: false, growth: true, business: true },
  { feature: 'Batch & expiry tracking (pharmacy)', free: false, starter: false, growth: true, business: true },
  { feature: 'Hide Malapos branding on receipts', free: false, starter: true, growth: true, business: true },
  { feature: 'Priority support', free: false, starter: false, growth: false, business: true },
];

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-primary" />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />;
  return <span className="text-sm">{value}</span>;
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 md:px-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">One price per store</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Flat monthly pricing per workspace, in rupiah — not per cashier. Pick the plan that
          fits your shop and add cashier seats within it.
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-2xl rounded-lg border border-primary/30 bg-primary/5 px-5 py-4 text-center">
        <p className="text-sm text-foreground">
          <span className="font-semibold">Start on Free — upgrade when you&apos;re ready.</span>{' '}
          The Free plan is Rp0 with no card. Move up to a paid plan whenever you need more
          outlets, products, and features.
        </p>
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`relative rounded-lg border p-8 ${
              tier.highlight ? 'border-primary shadow-lg shadow-primary/10' : 'border-border/50'
            }`}
          >
            {tier.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                Most Popular
              </span>
            )}
            <h2 className="text-xl font-bold">{tier.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
            <p className="mt-6 text-4xl font-bold">
              <Price idr={tier.idr} usdCents={tier.usdCents} />
              {tier.idr > 0 && (
                <span className="text-base font-normal text-muted-foreground">/mo</span>
              )}
            </p>
            <Link
              href="/signup"
              className={`mt-8 block rounded-md py-2.5 text-center text-sm font-medium ${
                tier.highlight
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'border border-border hover:bg-accent'
              }`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-20">
        <h2 className="text-center text-2xl font-bold">Feature comparison</h2>
        <div className="mt-10 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-4 pr-6 text-sm font-medium text-muted-foreground">Feature</th>
                <th className="pb-4 text-center text-sm font-medium">Free</th>
                <th className="pb-4 text-center text-sm font-medium text-primary">Starter</th>
                <th className="pb-4 text-center text-sm font-medium">Growth</th>
                <th className="pb-4 text-center text-sm font-medium">Business</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.feature} className="border-b border-border/50">
                  <td className="py-4 pr-6 text-sm">{row.feature}</td>
                  <td className="py-4 text-center"><CellValue value={row.free} /></td>
                  <td className="py-4 text-center"><CellValue value={row.starter} /></td>
                  <td className="py-4 text-center"><CellValue value={row.growth} /></td>
                  <td className="py-4 text-center"><CellValue value={row.business} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
