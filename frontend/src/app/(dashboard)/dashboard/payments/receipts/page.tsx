'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { receiptsApi, Receipt } from '@/lib/payments-api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Loader2, CheckCircle2, Mail } from 'lucide-react';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const SOURCE_LABEL: Record<string, string> = {
  checkout_session: 'Checkout',
  invoice: 'Invoice',
};

const SOURCE_OPTIONS = [
  { value: 'checkout_session', label: 'Checkout' },
  { value: 'invoice', label: 'Invoice' },
];

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    receiptsApi
      .list({ limit: 100 })
      .then((res) =>
        setReceipts(
          (res.data as unknown as { data?: Receipt[] })?.data ??
            (res.data as unknown as Receipt[])
        )
      )
      .catch(() => setReceipts([]))
      .finally(() => setLoading(false));
  }, []);

  const columns: Column<Receipt>[] = [
    {
      key: 'number',
      header: 'Number',
      sortable: true,
      sortValue: (r) => r.number,
      searchValue: (r) => `${r.number} ${r.emailedTo ?? ''}`,
      cell: (r) => (
        <Link href={`/dashboard/payments/receipts/${r.id}`} className="font-mono text-primary hover:underline">
          {r.number}
        </Link>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      sortable: true,
      sortValue: (r) => r.sourceType,
      cell: (r) => (
        <Badge variant="outline" className="rounded-full border-transparent bg-muted capitalize">
          {SOURCE_LABEL[r.sourceType] ?? r.sourceType}
        </Badge>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.amount,
      cell: (r) => (
        <span className="font-semibold">
          {r.currency === 'IDR' ? formatCurrency(r.amount) : `${r.currency} ${r.amount}`}
        </span>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      sortable: true,
      sortValue: (r) => r.method ?? r.adapter ?? '',
      cell: (r) => (
        <span className="text-muted-foreground">{r.method ?? r.adapter ?? '—'}</span>
      ),
    },
    {
      key: 'issuedAt',
      header: 'Issued',
      sortable: true,
      sortValue: (r) => new Date(r.issuedAt).getTime(),
      cell: (r) => <span className="text-muted-foreground">{formatDate(r.issuedAt)}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      sortValue: (r) => (r.emailedAt ? 1 : 0),
      cell: (r) =>
        r.emailedAt ? (
          <span className="inline-flex items-center gap-1 text-green-500" title={r.emailedTo ?? undefined}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Sent
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Mail className="h-3.5 w-3.5" /> —
          </span>
        ),
    },
  ];

  const filters: FilterDef<Receipt>[] = [
    { key: 'sourceType', label: 'Source', accessor: (r) => r.sourceType, options: SOURCE_OPTIONS },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Receipts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Immutable payment receipts issued when a checkout completes or an invoice is paid.
        </p>
      </div>

      {loading ? (
        <Card className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      ) : receipts.length === 0 ? (
        <Card className="flex h-48 items-center justify-center">
          <p className="text-sm text-muted-foreground">No receipts yet</p>
        </Card>
      ) : (
        <DataTable
          rows={receipts}
          columns={columns}
          filters={filters}
          rowKey={(r) => r.id}
          searchPlaceholder="Search receipt #, email…"
          defaultSort={{ key: 'issuedAt', dir: 'desc' }}
          empty="No receipts match."
        />
      )}
    </div>
  );
}
