'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { checkoutSessionsApi, CheckoutSession } from '@/lib/payments-api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Plus, ExternalLink, Loader2, Copy, Check } from 'lucide-react';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const STATUS_COLOR: Record<string, string> = {
  open: 'bg-amber-500/10 text-amber-400',
  completed: 'bg-emerald-500/10 text-emerald-400',
  expired: 'bg-muted text-muted-foreground',
  refunded: 'bg-destructive/10 text-destructive',
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
      onCreated(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Failed to create checkout session');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Checkout Session</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="50000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IDR">IDR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Pro Plan - Monthly"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customerEmail">Customer Email</Label>
            <Input
              id="customerEmail"
              type="email"
              value={form.customerEmail}
              onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
              placeholder="buyer@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="successUrl">Success URL</Label>
            <Input
              id="successUrl"
              type="url"
              required
              value={form.successUrl}
              onChange={(e) => setForm({ ...form, successUrl: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cancelUrl">Cancel URL</Label>
            <Input
              id="cancelUrl"
              type="url"
              required
              value={form.cancelUrl}
              onChange={(e) => setForm({ ...form, cancelUrl: e.target.value })}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Session
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
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
      .then((res) => setSessions(res.data ?? []))
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
        <Badge variant="outline" className={cn('rounded-full border-transparent', STATUS_COLOR[r.status] || 'bg-muted text-muted-foreground')}>
          {r.status}
        </Badge>
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
    <div className="space-y-6">
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Checkout Sessions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage and create hosted payment sessions</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> New Session
        </Button>
      </div>

      {loading ? (
        <Card className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      ) : sessions.length === 0 ? (
        <Card className="flex h-48 flex-col items-center justify-center gap-2">
          <p className="text-sm text-muted-foreground">No checkout sessions found</p>
          <Button variant="link" onClick={() => setShowCreate(true)} className="h-auto p-0 text-xs">
            Create your first session
          </Button>
        </Card>
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
