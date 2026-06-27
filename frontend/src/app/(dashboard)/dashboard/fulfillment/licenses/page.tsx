'use client';

import { useEffect, useState } from 'react';
import { Plus, Loader2, Copy, Check, Ban } from 'lucide-react';
import { licensesApi, type License } from '@/lib/fulfillment-api';
import { ApiRequestError } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';
import { FulfillmentModuleOff } from '@/components/fulfillment/module-off';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

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
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy key"
      className="h-6 w-6 text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Issue license key</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Fulkruma product ID" required value={form.productId} onChange={(v) => setForm({ ...form, productId: v })} placeholder="prod_…" mono />
          <Field label="Fulkruma customer ID" required value={form.customerId} onChange={(v) => setForm({ ...form, customerId: v })} placeholder="cust_…" mono />
          <div className="space-y-1.5">
            <Label htmlFor="maxActivations">
              Activation limit <span className="font-normal text-muted-foreground/60">(blank = unlimited)</span>
            </Label>
            <Input
              id="maxActivations"
              type="number"
              min="1"
              value={form.maxActivations}
              onChange={(e) => setForm({ ...form, maxActivations: e.target.value })}
              placeholder="e.g. 3"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expiresAt">
              Expires at <span className="font-normal text-muted-foreground/60">(optional)</span>
            </Label>
            <Input
              id="expiresAt"
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !form.productId || !form.customerId}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Issue key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, value, onChange, placeholder, mono }: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <Input
        type="text"
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(mono && 'font-mono')}
      />
    </div>
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
        <Badge variant="outline" className={cn('rounded-full border-transparent capitalize', STATUS_COLOR[l.status] || 'bg-muted text-muted-foreground')}>
          {l.status}
        </Badge>
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleRevoke(l.id)}
            disabled={revokingId === l.id}
            title="Revoke"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            {revokingId === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
          </Button>
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
    <div className="space-y-6">
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">License Keys</h1>
          <p className="mt-1 text-sm text-muted-foreground">Issue and manage license keys for your products.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Issue key
        </Button>
      </div>

      {loading ? (
        <Card className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      ) : licenses.length === 0 ? (
        <Card className="flex h-48 items-center justify-center">
          <p className="text-sm text-muted-foreground">No license keys yet.</p>
        </Card>
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
