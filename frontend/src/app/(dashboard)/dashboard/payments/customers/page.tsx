'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Users } from 'lucide-react';
import { customersApi, type Customer } from '@/lib/payments-api';
import { formatDate } from '@/lib/utils';
import { BillingTabs } from '@/components/payment/BillingTabs';
import { DataTable, type Column } from '@/components/data-table';

// Payment customers (Plugipay billing identities). malapos has no
// storefront buyer portal, so this lists the people you've billed —
// the counterpart to the Subscriptions tab.
export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    customersApi
      .list({ limit: 100 })
      .then((res) =>
        setCustomers(
          (res.data as unknown as { data?: Customer[] })?.data ??
            (res.data as unknown as Customer[]) ??
            []
        )
      )
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, []);

  const columns: Column<Customer>[] = [
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      sortValue: (r) => r.email ?? '',
      searchValue: (r) => `${r.email ?? ''} ${r.name ?? ''} ${r.phone ?? ''}`,
      cell: (r) => (
        <Link href={`/dashboard/payments/customers/${r.id}`} className="text-primary hover:underline">
          {r.email ?? r.id}
        </Link>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      sortValue: (r) => r.name ?? '',
      cell: (r) => r.name ?? '—',
    },
    {
      key: 'phone',
      header: 'Phone',
      sortable: true,
      sortValue: (r) => r.phone ?? '',
      cell: (r) => r.phone ?? '—',
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      sortValue: (r) => new Date(r.createdAt).getTime(),
      cell: (r) => <span className="text-muted-foreground">{formatDate(r.createdAt)}</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone you&apos;ve billed — online checkouts, subscriptions, and invoices.
          Open a customer to see their subscriptions and invoice history.
        </p>
      </div>

      <BillingTabs />

      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : customers.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card">
          <Users className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No customers yet</p>
        </div>
      ) : (
        <DataTable
          rows={customers}
          columns={columns}
          rowKey={(r) => r.id}
          searchPlaceholder="Search by email, name, or phone…"
          defaultSort={{ key: 'createdAt', dir: 'desc' }}
          empty="No customers match."
        />
      )}
    </div>
  );
}
