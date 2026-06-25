'use client';

import { useEffect, useState } from 'react';
import { Plus, Loader2, X, Copy, Check, Ban } from 'lucide-react';
import { licensesApi, type License } from '@/lib/fulfillment-api';
import { ApiRequestError } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';
import { FulfillmentModuleOff } from '@/components/fulfillment/module-off';

/*
 * Fulfillment → Licenses. malapos port of storlaunch's page over
 * /api/v1/fulfillment/licenses. Issue + manage software license keys
 * (Fulkruma). malapos has no local product/customer mirror in Fulkruma,
 * so the issue form takes the Fulkruma productId + customerId directly.
 */

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400',
  revoked: 'bg-destructive/10 text-destructive',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (l: License) => void }) {
  const [form, setForm] = useState({ productId: '', customerId: '', maxActivations: '', expiresAt: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await licensesApi.issue({
        productId: form.productId,
        customerId: form.customerId,
        maxActivations: form.maxActivations ? Number(form.maxActivations) : undefined,
        expiresAt: form.expiresAt || undefined,
      });
      if (res.data) onCreated(res.data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to issue license key');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Issue license key</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Fulkruma product ID" required value={form.productId} onChange={(v) => setForm({ ...form, productId: v })} placeholder="prod_…" mono />
          <Field label="Fulkruma customer ID" required value={form.customerId} onChange={(v) => setForm({ ...form, customerId: v })} placeholder="cust_…" mono />
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Activation limit <span className="text-muted-foreground/60">(blank = unlimited)</span>
            </label>
            <input
              type="number"
              min="1"
              value={form.maxActivations}
              onChange={(e) => setForm({ ...form, maxActivations: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g. 3"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Expires at <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <input
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded border border-border py-2 text-sm font-medium hover:bg-accent">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !form.productId || !form.customerId}
              className="flex flex-1 items-center justify-center gap-2 rounded bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Issue key
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required, value, onChange, placeholder, mono }: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}{required && <span className="text-destructive"> *</span>}</span>
      <input
        type="text"
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn('w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary', mono && 'font-mono')}
      />
    </label>
  );
}

export default function LicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    licensesApi
      .list()
      .then((res) => setLicenses(res.data ?? []))
      .catch((e) => {
        if (e instanceof ApiRequestError && e.status === 409) setModuleOff(true);
      })
      .finally(() => setLoading(false));
  }, []);

  function handleCreated(key: License) {
    setLicenses((prev) => [key, ...prev]);
    setShowCreate(false);
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this license key? This cannot be undone.')) return;
    setRevokingId(id);
    try {
      const res = await licensesApi.revoke(id);
      const updated = res.data;
      if (updated) setLicenses((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } catch {
      alert('Failed to revoke license key');
    } finally {
      setRevokingId(null);
    }
  }

  const columns: Column<License>[] = [
    {
      key: 'key',
      header: 'Key',
      sortable: true,
      sortValue: (l) => l.key,
      searchValue: (l) => `${l.key} ${l.productId} ${l.customerId}`,
      cell: (l) => (
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{l.key}</code>
          <CopyButton text={l.key} />
        </div>
      ),
    },
    {
      key: 'product',
      header: 'Product',
      sortable: true,
      sortValue: (l) => l.productId,
      cell: (l) => <span className="font-mono text-xs text-muted-foreground">{l.productId.slice(0, 12)}…</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (l) => l.status,
      cell: (l) => (
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_COLOR[l.status] || 'bg-muted text-muted-foreground')}>
          {l.status}
        </span>
      ),
    },
    {
      key: 'activations',
      header: 'Activations',
      align: 'right',
      sortable: true,
      sortValue: (l) => l.activations,
      cell: (l) => <span className="text-muted-foreground">{l.activations} / {l.maxActivations || '∞'}</span>,
    },
    {
      key: 'expires',
      header: 'Expires',
      sortable: true,
      sortValue: (l) => (l.expiresAt ? new Date(l.expiresAt).getTime() : Number.MAX_SAFE_INTEGER),
      cell: (l) => <span className="text-muted-foreground">{l.expiresAt ? formatDate(l.expiresAt) : 'Never'}</span>,
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      sortValue: (l) => new Date(l.createdAt).getTime(),
      cell: (l) => <span className="text-muted-foreground">{formatDate(l.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (l) =>
        l.status === 'active' ? (
          <button
            onClick={() => handleRevoke(l.id)}
            disabled={revokingId === l.id}
            title="Revoke"
            className="text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            {revokingId === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
          </button>
        ) : null,
    },
  ];

  const filters: FilterDef<License>[] = [
    {
      key: 'status',
      label: 'Status',
      accessor: (l) => l.status,
      options: [
        { value: 'active', label: 'Active' },
        { value: 'revoked', label: 'Revoked' },
      ],
    },
  ];

  if (moduleOff) return <FulfillmentModuleOff blurb="License keys are issued + validated by Fulkruma. Turn on the Fulfillment module to manage them." />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">License Keys</h1>
          <p className="mt-1 text-sm text-muted-foreground">Issue and manage license keys for your products.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Issue key
        </button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : licenses.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-card">
          <p className="text-sm text-muted-foreground">No license keys yet.</p>
        </div>
      ) : (
        <DataTable
          rows={licenses}
          columns={columns}
          filters={filters}
          rowKey={(l) => l.id}
          searchPlaceholder="Search key, product, customer…"
          defaultSort={{ key: 'createdAt', dir: 'desc' }}
          empty="No license keys match."
        />
      )}
    </div>
  );
}
