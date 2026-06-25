'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Receipt,
  RefreshCcw,
  Phone,
  Mail,
  CalendarDays,
} from 'lucide-react';
import {
  customersApi,
  subscriptionsApi,
  invoicesApi,
  type Customer,
  type Subscription,
  type Invoice,
} from '@/lib/payments-api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

// malapos has no storefront buyer portal, so this detail page is rebuilt
// on the payment Customer model: profile + their Plugipay subscriptions
// and invoices. (storlaunch's buyer order-history / buyersApi flow is
// dropped — there is no buyersApi here.)

const SUB_STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400',
  trialing: 'bg-blue-500/10 text-blue-400',
  past_due: 'bg-amber-500/10 text-amber-400',
  paused: 'bg-yellow-500/10 text-yellow-400',
  canceled: 'bg-muted text-muted-foreground',
};

const INVOICE_STATUS_COLOR: Record<string, string> = {
  paid: 'bg-green-500/10 text-green-400',
  open: 'bg-blue-500/10 text-blue-400',
  past_due: 'bg-amber-500/10 text-amber-400',
  draft: 'bg-muted text-muted-foreground',
  void: 'bg-muted text-muted-foreground',
  uncollectible: 'bg-red-500/10 text-red-400',
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    customersApi
      .get(id)
      .then((res) => {
        const body = res.data as unknown as { data?: Customer } | Customer;
        setCustomer(((body as { data?: Customer }).data ?? body) as Customer);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
    // Enrich with the customer's subscriptions + invoices (best-effort).
    subscriptionsApi
      .list({ customerId: id, limit: 100 })
      .then((res) => setSubscriptions((res.data as unknown as { data?: Subscription[] })?.data ?? (res.data as unknown as Subscription[]) ?? []))
      .catch(() => setSubscriptions([]));
    invoicesApi
      .list({ customerId: id, limit: 100 })
      .then((res) => setInvoices((res.data as unknown as { data?: Invoice[] })?.data ?? (res.data as unknown as Invoice[]) ?? []))
      .catch(() => setInvoices([]));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-5xl space-y-3 p-8">
        <p className="text-sm text-red-400">{error ?? 'Customer not found'}</p>
        <Link href="/dashboard/payments/customers" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <ArrowLeft className="h-3 w-3" /> Back to Customers
        </Link>
      </div>
    );
  }

  const activeSubs = subscriptions.filter((s) =>
    ['active', 'trialing', 'past_due', 'paused'].includes(s.status),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="text-xs text-muted-foreground">
        <Link href="/dashboard/payments/customers" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Customers
        </Link>
        <span className="mx-1.5 text-muted-foreground/50">/</span>
        <span className="text-foreground">{customer.name ?? customer.email ?? customer.id}</span>
      </nav>

      {/* Identity card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-bold tracking-tight">{customer.name ?? customer.email ?? customer.id}</h1>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {customer.email && <Field icon={Mail} label="Email" value={customer.email} />}
          {customer.phone && <Field icon={Phone} label="Phone" value={customer.phone} />}
          <Field icon={CalendarDays} label="Created" value={formatDate(customer.createdAt)} />
          {customer.externalId && <Field icon={Receipt} label="External ID" value={customer.externalId} />}
        </dl>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Subscriptions" value={String(subscriptions.length)} />
        <Stat label="Active subscriptions" value={String(activeSubs.length)} />
        <Stat label="Invoices" value={String(invoices.length)} />
      </div>

      {/* Subscriptions (only when present) */}
      {subscriptions.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <RefreshCcw className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Subscriptions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Plan</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Current period</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subscriptions.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{s.planName ?? s.planId}</td>
                    <td className="px-3 py-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', SUB_STATUS_COLOR[s.status] ?? 'bg-muted text-muted-foreground')}>
                        {s.status.replace(/_/g, ' ')}
                      </span>
                      {s.cancelAtPeriodEnd && (
                        <span className="ml-2 text-xs text-orange-400">Cancels EOT</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDate(s.currentPeriodStart)} → {formatDate(s.currentPeriodEnd)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/dashboard/payments/subscriptions/${s.id}`} className="text-xs text-primary hover:underline">
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoices */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Invoices</h2>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No invoices yet. Paid invoices and completed checkouts for this customer will appear here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={`/dashboard/payments/invoices/${inv.id}`}
                  className="-mx-3 flex items-center justify-between gap-4 rounded-md px-3 py-3 hover:bg-muted/30"
                >
                  <div>
                    <p className="text-sm font-medium">{inv.number ?? inv.id}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className={cn('mr-2 rounded-full px-2 py-0.5 capitalize', INVOICE_STATUS_COLOR[inv.status] ?? 'bg-muted text-muted-foreground')}>
                        {inv.status.replace(/_/g, ' ')}
                      </span>
                      {formatDate(inv.paidAt ?? inv.createdAt)}
                    </p>
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums">
                    {inv.currency === 'IDR' ? formatCurrency(inv.amount) : `${inv.currency} ${inv.amount}`}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div>
        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    </div>
  );
}
