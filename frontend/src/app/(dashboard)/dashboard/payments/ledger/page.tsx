'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ledgerApi, type LedgerEntry, type LedgerCategory } from '@/lib/payments-api';
import { Loader2, ArrowDownRight, ArrowUpRight, Download } from 'lucide-react';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * /dashboard/payments/ledger — the merchant's running money log.
 *
 * (storlaunch's manual "Adjustment" modal is dropped — malapos's
 * ledgerApi has no postAdjustment endpoint.)
 */

const CATEGORY_LABEL: Record<LedgerCategory, string> = {
  sale: 'Sale',
  refund: 'Refund',
  platform_fee: 'Platform fee',
  channel_fee: 'Channel fee',
  shipping_cost: 'Shipping cost',
  shipping_refund: 'Shipping refund',
  payout: 'Payout',
  adjustment: 'Adjustment',
};

// malapos serves the ledger CSV under /api/v1/payments/*; derive the
// origin from NEXT_PUBLIC_API_URL, stripping any trailing /api/v1.
const API_BASE = (
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4191'
).replace(/\/api\/v1\/?$/, '') + '/api/v1';

export default function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [balance, setBalance] = useState<{ balance: number; currency: string | null }>({ balance: 0, currency: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFirst = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [balRes, entriesRes] = await Promise.all([
        ledgerApi.getBalance(),
        ledgerApi.listEntries({ limit: 100 }),
      ]);
      setBalance({ balance: balRes.data.balance, currency: balRes.data.currency });
      setEntries(entriesRes.data ?? []);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to load ledger');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  const fmt = useMemo(() => (amount: number, currency?: string | null) =>
    new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'id-ID', {
      style: 'currency',
      currency: currency || balance.currency || 'IDR',
      minimumFractionDigits: 0,
    }).format(amount), [balance.currency]);

  async function exportCsv() {
    try {
      const res = await fetch(`${API_BASE}/payments/ledger/entries.csv`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ledger-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  }

  const columns: Column<LedgerEntry>[] = [
    {
      key: 'when',
      header: 'When',
      sortable: true,
      sortValue: (e) => new Date(e.createdAt).getTime(),
      searchValue: (e) => `${e.description} ${e.customer?.email ?? ''}`,
      cell: (e) => (
        <span className="text-muted-foreground">
          {new Date(e.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      sortValue: (e) => e.category ?? '',
      cell: (e) => (
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {e.category ? CATEGORY_LABEL[e.category] : '—'}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      sortable: true,
      sortValue: (e) => e.description,
      cell: (e) => (
        <div>
          <div>{e.description}</div>
          {e.customer && (
            <div className="text-xs text-muted-foreground">{e.customer.email}</div>
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortable: true,
      sortValue: (e) => (e.type === 'credit' ? e.amount : -e.amount),
      cell: (e) => (
        <span className={`inline-flex items-center gap-1 font-mono ${e.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
          {e.type === 'credit' ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
          {e.type === 'credit' ? '+' : '−'}{fmt(e.amount, e.currency)}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      sortable: true,
      sortValue: (e) => e.balanceAfter,
      cell: (e) => (
        <span className="font-mono text-xs text-muted-foreground">{fmt(e.balanceAfter, e.currency)}</span>
      ),
    },
  ];

  const filters: FilterDef<LedgerEntry>[] = [
    {
      key: 'type',
      label: 'Direction',
      accessor: (e) => e.type,
      options: [
        { value: 'credit', label: 'Credits (incoming)' },
        { value: 'debit', label: 'Debits (outgoing)' },
      ],
    },
    {
      key: 'category',
      label: 'Category',
      accessor: (e) => e.category ?? '',
      options: Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label })),
    },
  ];

  if (loading) return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Ledger</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed money log. Every sale, refund, fee, shipping charge, and manual
            adjustment lands here with a running balance.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" onClick={exportCsv} className="whitespace-nowrap">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </header>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <Card className="rounded-xl p-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Running balance</p>
        <p className="mt-1 text-3xl font-bold">{fmt(balance.balance, balance.currency)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Across all ledger entries</p>
      </Card>

      {entries.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          No entries yet. Once you take a payment or issue a refund, the ledger will fill up.
        </Card>
      ) : (
        <DataTable
          rows={entries}
          columns={columns}
          filters={filters}
          rowKey={(e) => e.id}
          searchPlaceholder="Search description, customer…"
          defaultSort={{ key: 'when', dir: 'desc' }}
          empty="No entries match."
        />
      )}
    </div>
  );
}
