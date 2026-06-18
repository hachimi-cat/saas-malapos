'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Store, X } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';

/*
 * Outlets manager — the store-setup surface. List every outlet (name,
 * address, phone, tax rate, active state) and create / edit / delete them.
 * Tax is stored server-side in basis points of 10000 (11% = 1100); the form
 * speaks plain percent and converts on the wire. Built against the real
 * backend; no mock data.
 */

type Outlet = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  timezone: string | null;
  taxRateBps: number;
  taxInclusive: boolean;
  receiptHeader: string | null;
  receiptFooter: string | null;
  isActive: boolean;
  createdAt: string;
};

type FormState = {
  name: string;
  address: string;
  phone: string;
  timezone: string;
  taxPercent: string;
  taxInclusive: boolean;
  receiptHeader: string;
  receiptFooter: string;
};

const empty: FormState = {
  name: '',
  address: '',
  phone: '',
  timezone: '',
  taxPercent: '',
  taxInclusive: false,
  receiptHeader: '',
  receiptFooter: '',
};

function toForm(o: Outlet): FormState {
  return {
    name: o.name,
    address: o.address ?? '',
    phone: o.phone ?? '',
    timezone: o.timezone ?? '',
    taxPercent: o.taxRateBps ? String(o.taxRateBps / 100) : '',
    taxInclusive: o.taxInclusive,
    receiptHeader: o.receiptHeader ?? '',
    receiptFooter: o.receiptFooter ?? '',
  };
}

export default function OutletsPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Outlet | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const res = await api.get<{ outlets: Outlet[] }>('/outlets');
      setOutlets(res.data.outlets);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load outlets');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(o: Outlet) {
    if (!confirm(`Delete outlet "${o.name}"? This can't be undone.`)) return;
    setError(null);
    try {
      await api.delete(`/outlets/${o.id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to delete outlet');
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Outlets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your stores and their tax, timezone, and receipt settings.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add outlet
        </button>
      </div>

      {outlets.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Store className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-medium">No outlets yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first store to start selling.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add outlet
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Tax</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {outlets.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0 hover:bg-accent">
                  <td className="px-4 py-3 font-medium">{o.name}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">{o.address || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{o.phone || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {o.taxRateBps > 0 ? (
                      <>
                        {(o.taxRateBps / 100).toFixed(o.taxRateBps % 100 ? 2 : 0)}%
                        {o.taxInclusive && <span className="ml-1 text-xs">(incl.)</span>}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        o.isActive
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {o.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditing(o)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(o)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <OutletModal
          outlet={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await load();
          }}
        />
      )}

      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}

function OutletModal({
  outlet,
  onClose,
  onSaved,
}: {
  outlet: Outlet | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(outlet ? toForm(outlet) : empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.name.trim()) {
      setErr('Name is required.');
      return;
    }
    setBusy(true);
    setErr(null);

    const pct = parseFloat(form.taxPercent);
    const taxRateBps = Number.isFinite(pct) ? Math.round(pct * 100) : 0;

    const body = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      timezone: form.timezone.trim() || null,
      taxRateBps,
      taxInclusive: form.taxInclusive,
      receiptHeader: form.receiptHeader.trim() || null,
      receiptFooter: form.receiptFooter.trim() || null,
    };

    try {
      if (outlet) {
        await api.patch<{ outlet: Outlet }>(`/outlets/${outlet.id}`, body);
      } else {
        await api.post<{ outlet: Outlet }>('/outlets', body);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Failed to save outlet');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{outlet ? 'Edit outlet' : 'New outlet'}</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <Field label="Name">
            <input
              autoFocus
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Main Store"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>

          <Field label="Address">
            <input
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Jl. Sudirman No. 1"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+62…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
            <Field label="Timezone">
              <input
                value={form.timezone}
                onChange={(e) => set('timezone', e.target.value)}
                placeholder="Asia/Jakarta"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
          </div>

          <Field label="Tax rate (%)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.taxPercent}
              onChange={(e) => set('taxPercent', e.target.value)}
              placeholder="11"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.taxInclusive}
              onChange={(e) => set('taxInclusive', e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary focus:ring-2 focus:ring-ring"
            />
            <span>Prices include tax</span>
          </label>

          <Field label="Receipt header">
            <textarea
              value={form.receiptHeader}
              onChange={(e) => set('receiptHeader', e.target.value)}
              rows={2}
              placeholder="Shown at the top of printed receipts"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>

          <Field label="Receipt footer">
            <textarea
              value={form.receiptFooter}
              onChange={(e) => set('receiptFooter', e.target.value)}
              rows={2}
              placeholder="Thank you for shopping with us!"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
        </div>

        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={save}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Saving…' : outlet ? 'Save changes' : 'Create outlet'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
