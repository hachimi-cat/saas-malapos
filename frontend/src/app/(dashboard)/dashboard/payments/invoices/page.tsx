'use client';

import { useEffect, useState } from 'react';
import { invoicesApi, Invoice } from '@/lib/payments-api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import Link from 'next/link';
import { Loader2, Download, ExternalLink } from 'lucide-react';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const STATUS_COLOR: Record<string, string> = {
  paid: 'bg-emerald-500/10 text-emerald-400',
  open: 'bg-amber-500/10 text-amber-400',
  draft: 'bg-muted text-muted-foreground',
  void: 'bg-muted text-muted-foreground',
  uncollectible: 'bg-destructive/10 text-destructive',
};

const STATUS_OPTIONS = [
  { value: 'paid', label: 'Paid' },
  { value: 'open', label: 'Open' },
  { value: 'draft', label: 'Draft' },
  { value: 'void', label: 'Void' },
  { value: 'uncollectible', label: 'Uncollectible' },
];

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    invoicesApi
      .list({ limit: 100 })
      .then((res) => setInvoices(res.data ?? []))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  }, []);

  async function exportCsv() {
    try {
      const base = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/api\/v1\/?$/, '');
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const accountId = typeof window !== 'undefined' ? localStorage.getItem('malapos_account_id') : null;
      const res = await fetch(`${base}/api/v1/payments/invoices/export.csv`, {
        credentials: 'include',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(accountId ? { 'X-Account-Id': accountId } : {}),
        },
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* swallow */
    }
  }

  const columns: Column<Invoice>[] = [
    {
      key: 'id',
      header: 'Invoice ID',
      sortable: true,
      sortValue: (r) => r.id,
      searchValue: (r) => `${r.id} ${r.customerEmail ?? ''} ${r.customerId ?? ''}`,
      cell: (r) => (
        <Link href={`/dashboard/payments/invoices/${r.id}`} className="font-mono text-primary hover:underline">
          {r.id}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      sortValue: (r) => r.customerEmail ?? r.customerId ?? '',
      cell: (r) => r.customerEmail || r.customerId || '—',
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.amount,
      cell: (r) => (
        <span className="font-semibold">
          {r.currency === 'IDR' ? formatCurrency(r.amount) : `$${r.amount}`}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (r) => r.status,
      cell: (r) => (
        <Badge
          variant="outline"
          className={cn(
            'rounded-full border-transparent capitalize',
            STATUS_COLOR[r.status] || 'bg-muted text-muted-foreground'
          )}
        >
          {r.status}
        </Badge>
      ),
    },
    {
      key: 'dueDate',
      header: 'Due Date',
      sortable: true,
      sortValue: (r) => (r.dueDate ? new Date(r.dueDate).getTime() : 0),
      cell: (r) => (
        <span className="text-muted-foreground">{r.dueDate ? formatDate(r.dueDate) : '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      sortValue: (r) => new Date(r.createdAt).getTime(),
      cell: (r) => <span className="text-muted-foreground">{formatDate(r.createdAt)}</span>,
    },
    {
      key: 'pdf',
      header: 'PDF',
      cell: (r) =>
        r.pdfUrl ? (
          <div className="flex items-center gap-2">
            <a href={r.pdfUrl} download className="text-muted-foreground hover:text-primary" title="Download PDF">
              <Download className="h-4 w-4" />
            </a>
            <a href={r.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary" title="Open PDF">
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  const filters: FilterDef<Invoice>[] = [
    { key: 'status', label: 'Status', accessor: (r) => r.status, options: STATUS_OPTIONS },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All billing invoices with PDF download
          </p>
        </div>
        <Button type="button" variant="outline" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      {loading ? (
        <Card className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      ) : invoices.length === 0 ? (
        <Card className="flex h-48 items-center justify-center">
          <p className="text-sm text-muted-foreground">No invoices found</p>
        </Card>
      ) : (
        <DataTable
          rows={invoices}
          columns={columns}
          filters={filters}
          rowKey={(r) => r.id}
          searchPlaceholder="Search invoice id, customer…"
          defaultSort={{ key: 'createdAt', dir: 'desc' }}
          empty="No invoices match."
        />
      )}

      <p className="text-xs text-muted-foreground">
        Click on an invoice to view line items and tax details. PDFs include full billing information.
      </p>
    </div>
  );
}
