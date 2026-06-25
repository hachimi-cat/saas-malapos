'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// Shared pill switcher between /dashboard/payments/subscriptions and
// /dashboard/payments/customers (S-035). Both pages live under the Payment
// module; this lets merchants flip between recurring subscriptions
// and the underlying Plugipay billing customer list without going
// back to the sidebar.

const TABS = [
  { href: '/dashboard/payments/subscriptions', label: 'Subscriptions' },
  { href: '/dashboard/payments/customers', label: 'Customers' },
];

export function BillingTabs() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-muted-foreground hover:bg-accent',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
