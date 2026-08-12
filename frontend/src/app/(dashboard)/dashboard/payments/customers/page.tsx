'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Users } from 'lucide-react';
import { customersApi, type Customer } from '@/lib/payments-api';
import { formatDate } from '@/lib/utils';
import { BillingTabs } from '@/components/payment/BillingTabs';
import { DataTable, type Column } from '@/components/data-table';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageAssistant, BulkEditSlot } from '@/components/catentio/agentic-entry';
import { useCatentioStatus } from '@/hooks/use-catentio';
import { BulkBar } from '@/components/dashboard/bulk-bar';
import { Card } from '@/components/ui/card';

// Payment customers (Plugipay billing identities). malapos has no
// storefront buyer portal, so this lists the people you've billed —
// the counterpart to the Subscriptions tab. The page itself is
// read-only; creating/editing goes through the agentic sheet (the
// sparkle for create, the bulk bar's Edit for the selection) — there
// is no hand-built form here, and /payments/customers has no DELETE
// route, so the bar offers Edit alone.
export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  // The rows the bulk-edit sheet was opened over, or null when closed.
  const [bulkEditTargets, setBulkEditTargets] = useState<Customer[] | null>(null);
  // The DataTable's ticked rows, mirrored up so the page assistant's
  // action picker can offer Edit / Bulk edit over them.
  const [selection, setSelection] = useState<Customer[]>([]);
  // DataTable owns the selection; keep its clear() so a successful bulk
  // edit can drop the ticks along with closing the sheet.
  const clearSelectionRef = useRef<(() => void) | null>(null);
  const { enabled: assistantEnabled } = useCatentioStatus();

  async function load() {
    setLoading(true);
    try {
      const res = await customersApi.list({ limit: 100 });
      setCustomers(res.data ?? []);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description={
          <>
            Everyone you&apos;ve billed — online checkouts, subscriptions, and invoices.
            Open a customer to see their subscriptions and invoice history.
          </>
        }
        action={
          <PageAssistant
            resource="payment-customers"
            noun="customer"
            // No DELETE route on /payments/customers, so no
            // onDeleteSelected — the selection powers Edit / Bulk edit
            // only. Customer is an interface (no implicit index
            // signature) — spread into fresh objects.
            selection={selection.map((c) => ({ ...c }))}
            onApplied={load}
          />
        }
      />

      <BillingTabs />

      {loading ? (
        <Card className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      ) : customers.length === 0 ? (
        <Card className="flex h-48 flex-col items-center justify-center gap-2">
          <Users className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No customers yet</p>
        </Card>
      ) : (
        <DataTable
          rows={customers}
          columns={columns}
          rowKey={(r) => r.id}
          searchPlaceholder="Search by email, name, or phone…"
          defaultSort={{ key: 'createdAt', dir: 'desc' }}
          empty="No customers match."
          onSelectionChange={setSelection}
          // Selection exists only for the agentic bulk edit, so the
          // checkboxes appear only when the assistant is on. No DELETE
          // route on /payments/customers → the bar offers Edit alone.
          renderBulkBar={
            assistantEnabled
              ? (selectedRows, clear) => (
                  <BulkBar
                    count={selectedRows.length}
                    noun="customer"
                    onEdit={() => {
                      clearSelectionRef.current = clear;
                      setBulkEditTargets(selectedRows);
                    }}
                    onClear={clear}
                  />
                )
              : undefined
          }
        />
      )}

      {bulkEditTargets && (
        <BulkEditSlot
          resource="payment-customers"
          // Customer is an interface (no implicit index signature) —
          // spread into fresh objects for Record<string, unknown>[].
          targets={bulkEditTargets.map((c) => ({ ...c }))}
          onClose={() => setBulkEditTargets(null)}
          onApplied={async () => {
            setBulkEditTargets(null);
            clearSelectionRef.current?.();
            await load();
          }}
        />
      )}
    </div>
  );
}
