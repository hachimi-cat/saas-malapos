import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { Price } from '@forjio/website-ui';

/*
 * FORKERS: the tier names (Free / Pro / Business) and the IDR + USD
 * dual-pricing are the family standard. Replace the comparison rows
 * with the real per-tier limits of Malapos. usdCents should
 * mirror backend/src/config/plans.ts once that exists.
 */

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Transparent pricing for Malapos. Start free, upgrade when you need to.',
};

const tiers = [
  { name: 'Free',     idr: 0,       usdCents: 0,     description: 'For side projects and personal use.', cta: 'Start Free',   highlight: false },
  { name: 'Pro',      idr: 79_000,  usdCents: 500,   description: 'For solo operators and small teams.', cta: 'Get Pro',      highlight: true  },
  { name: 'Business', idr: 299_000, usdCents: 1_900, description: 'For teams that need scale.',          cta: 'Get Business', highlight: false },
];

const comparisonRows = [
  { feature: 'Core capability / month', free: 'Limited', pro: 'Expanded', business: 'Unlimited' },
  { feature: 'Workspace members', free: '1', pro: '1', business: '5' },
  { feature: 'Owned workspaces', free: '1', pro: '3', business: 'Unlimited' },
  { feature: 'Custom branding', free: false, pro: true, business: true },
  { feature: 'Analytics retention', free: '30 days', pro: '1 year', business: 'Unlimited' },
  { feature: 'CLI access', free: true, pro: true, business: true },
  { feature: 'API rate limit', free: '60 req/min', pro: '600 req/min', business: '2,000 req/min' },
  { feature: 'Data export (CSV / JSON)', free: 'CSV only', pro: 'CSV + JSON', business: 'CSV + JSON' },
  { feature: 'Priority support', free: false, pro: false, business: true },
  { feature: 'Payment methods (IDR)', free: '—', pro: 'QRIS · VA · e-wallet · card', business: 'QRIS · VA · e-wallet · card' },
  { feature: 'Payment methods (USD intl)', free: '—', pro: 'PayPal', business: 'PayPal' },
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
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Transparent pricing</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          No hidden fees. No annual lock-in. Start free, pay only when you need more.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          Indonesian customers pay in IDR. International customers pay in USD via PayPal —
          Midtrans doesn&apos;t process USD.
        </p>
      </div>

      <div className="mt-16 grid gap-8 sm:grid-cols-3">
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
                <th className="pb-4 text-center text-sm font-medium text-primary">Pro</th>
                <th className="pb-4 text-center text-sm font-medium">Business</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.feature} className="border-b border-border/50">
                  <td className="py-4 pr-6 text-sm">{row.feature}</td>
                  <td className="py-4 text-center"><CellValue value={row.free} /></td>
                  <td className="py-4 text-center"><CellValue value={row.pro} /></td>
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
