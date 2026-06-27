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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
      .then((res) => setCustomer(res.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
    // Enrich with the customer's subscriptions + invoices (best-effort).
    subscriptionsApi
      .list({ customerId: id, limit: 100 })
      .then((res) => setSubscriptions(res.data ?? []))
      .catch(() => setSubscriptions([]));
    invoicesApi
      .list({ customerId: id, limit: 100 })
      .then((res) => setInvoices(res.data ?? []))
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
      <div className="space-y-3 p-8">
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
    <div className="space-y-6">
      <nav className="text-xs text-muted-foreground">
        <Link href="/dashboard/payments/customers" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Customers
        </Link>
        <span className="mx-1.5 text-muted-foreground/50">/</span>
        <span className="text-foreground">{customer.name ?? customer.email ?? customer.id}</span>
      </nav>

      {/* Identity card */}
      <Card>
        <CardContent className="p-6">
          <h1 className="text-2xl font-semibold tracking-tight font-display">{customer.name ?? customer.email ?? customer.id}</h1>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {customer.email && <Field icon={Mail} label="Email" value={customer.email} />}
            {customer.phone && <Field icon={Phone} label="Phone" value={customer.phone} />}
            <Field icon={CalendarDays} label="Created" value={formatDate(customer.createdAt)} />
            {customer.externalId && <Field icon={Receipt} label="External ID" value={customer.externalId} />}
          </dl>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Subscriptions" value={String(subscriptions.length)} />
        <Stat label="Active subscriptions" value={String(activeSubs.length)} />
        <Stat label="Invoices" value={String(invoices.length)} />
      </div>

      {/* Subscriptions (only when present) */}
      {subscriptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCcw className="h-4 w-4 text-muted-foreground" />
              Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3 py-2 text-xs">Plan</TableHead>
                  <TableHead className="px-3 py-2 text-xs">Status</TableHead>
                  <TableHead className="px-3 py-2 text-xs">Current period</TableHead>
                  <TableHead className="px-3 py-2 text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/30">
                    <TableCell className="px-3 py-2 font-medium">{s.planName ?? s.planId}</TableCell>
                    <TableCell className="px-3 py-2">
                      <Badge variant="outline" className={cn('rounded-full border-transparent px-2 py-0.5 text-xs font-medium capitalize', SUB_STATUS_COLOR[s.status] ?? 'bg-muted text-muted-foreground')}>
                        {s.status.replace(/_/g, ' ')}
                      </Badge>
                      {s.cancelAtPeriodEnd && (
                        <span className="ml-2 text-xs text-orange-400">Cancels EOT</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDate(s.currentPeriodStart)} → {formatDate(s.currentPeriodEnd)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right">
                      <Link href={`/dashboard/payments/subscriptions/${s.id}`} className="text-xs text-primary hover:underline">
                        Open →
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Invoices */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Badge variant="outline" className={cn('mr-2 rounded-full border-transparent px-2 py-0.5 font-normal capitalize', INVOICE_STATUS_COLOR[inv.status] ?? 'bg-muted text-muted-foreground')}>
                          {inv.status.replace(/_/g, ' ')}
                        </Badge>
                        {formatDate(inv.paidAt ?? inv.createdAt)}
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums">
                      {inv.currency === 'IDR' ? formatCurrency(inv.amount) : `${inv.currency} ${inv.amount}`}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </Card>
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
