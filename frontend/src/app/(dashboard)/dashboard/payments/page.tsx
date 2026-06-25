'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { checkoutSessionsApi, CheckoutSession } from '@/lib/payments-api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Plus, ExternalLink, Loader2, X, Copy, Check } from 'lucide-react';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';

const STATUS_COLOR: Record<string, string> = {
  open: 'bg-yellow-500/10 text-yellow-400',
  completed: 'bg-green-500/10 text-green-400',
  expired: 'bg-muted text-muted-foreground',
  refunded: 'bg-red-500/10 text-red-400',
};

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Expired' },
  { value: 'refunded', label: 'Refunded' },
];

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: CheckoutSession) => void }) {
  const [form, setForm] = useState({
    amount: '',
    currency: 'IDR',
    description: '',
    customerEmail: '',
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.amount || isNaN(Number(form.amount))) {
      setError('Amount must be a valid number');
      return;
    }
    setLoading(true);
    try {
      const res = await checkoutSessionsApi.create({
        amount: Number(form.amount),
        currency: form.currency,
        successUrl: form.successUrl,
        cancelUrl: form.cancelUrl,
      });
      onCreated(res.data as unknown as CheckoutSession);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Failed to create checkout session');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Checkout Session</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount</label>
              <input
                type="number"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="50000"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Pro Plan - Monthly"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Customer Email</label>
            <input
              type="email"
              value={form.customerEmail}
              onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="buyer@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Success URL</label>
            <input
              type="url"
              required
              value={form.successUrl}
              onChange={(e) => setForm({ ...form, successUrl: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Cancel URL</label>
            <input
              type="url"
              required
              value={form.cancelUrl}
              onChange={(e) => setForm({ ...form, cancelUrl: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded border border-border py-2 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground" title="Copy URL">
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function PaymentsPage() {
  const [sessions, setSessions] = useState<CheckoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    checkoutSessionsApi
      .list({ limit: 100 })
      .then((res) => setSessions((res.data as unknown as { data?: CheckoutSession[] })?.data ?? (res.data as unknown as CheckoutSession[])))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  function handleCreated(session: CheckoutSession) {
    setSessions((prev) => [session, ...prev]);
    setShowCreate(false);
  }

  const columns: Column<CheckoutSession>[] = [
    {
      key: 'id',
      header: 'ID',
      sortable: true,
      sortValue: (r) => r.id,
      searchValue: (r) => `${r.id} ${r.description ?? ''}`,
      cell: (r) => (
        <Link href={`/dashboard/payments/${r.id}`} className="font-mono text-primary hover:underline">
          {r.id}
        </Link>
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
          {r.currency === 'IDR' ? formatCurrency(r.amount) : `$${r.amount}`}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      sortable: true,
      sortValue: (r) => r.description ?? '',
      cell: (r) => <span className="text-muted-foreground">{r.description || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (r) => r.status,
      cell: (r) => (
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLOR[r.status] || 'bg-muted text-muted-foreground')}>
          {r.status}
        </span>
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
      key: 'link',
      header: 'Link',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <CopyButton text={r.checkoutUrl} />
          <a href={r.checkoutUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ),
    },
  ];

  const filters: FilterDef<CheckoutSession>[] = [
    { key: 'status', label: 'Status', accessor: (r) => r.status, options: STATUS_OPTIONS },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Checkout Sessions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage and create hosted payment sessions</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Session
        </button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card">
          <p className="text-sm text-muted-foreground">No checkout sessions found</p>
          <button onClick={() => setShowCreate(true)} className="text-xs text-primary hover:underline">
            Create your first session
          </button>
        </div>
      ) : (
        <DataTable
          rows={sessions}
          columns={columns}
          filters={filters}
          rowKey={(r) => r.id}
          searchPlaceholder="Search id, description…"
          defaultSort={{ key: 'createdAt', dir: 'desc' }}
          empty="No sessions match."
        />
      )}
    </div>
  );
}
