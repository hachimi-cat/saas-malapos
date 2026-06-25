'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, CheckCircle2, AlertCircle, Building2 } from 'lucide-react';
import { warehousesApi, type Warehouse } from '@/lib/fulfillment-api';
import { ApiRequestError } from '@/lib/api';
import { FulfillmentModuleOff } from '@/components/fulfillment/module-off';

/*
 * Fulfillment → Warehouses. malapos port of storlaunch's fulfillment/
 * warehouses page over /api/v1/fulfillment/warehouses. These are the
 * FULKRUMA warehouses (where physical stock is stored + shipped from) —
 * distinct from malapos's own POS inventory at /dashboard/inventory.
 */

export default function WarehousesPage() {
  const [list, setList] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [editing, setEditing] = useState<Warehouse | 'new' | null>(null);
  const [error, setError] = useState('');

  async function refresh() {
    const res = await warehousesApi.list();
    setList(res.data ?? []);
  }

  useEffect(() => {
    refresh()
      .catch((e) => {
        if (e instanceof ApiRequestError && e.status === 409) setModuleOff(true);
        else setError('Failed to load warehouses');
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(w: Warehouse) {
    if (!confirm(`Delete "${w.name}"? Stock records are preserved.`)) return;
    try {
      await warehousesApi.delete(w.id);
      await refresh();
    } catch (e) {
      alert(e instanceof ApiRequestError ? e.message : 'Delete failed');
    }
  }

  async function handleSetDefault(w: Warehouse) {
    await warehousesApi.update(w.id, { isDefault: true });
    await refresh();
  }

  if (moduleOff) return <FulfillmentModuleOff blurb="Warehouses are where Fulkruma stores + ships your physical stock. Turn on the Fulfillment module to manage them." />;
  if (loading) return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Warehouses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Where you store + ship from. Each variant tracks stock per warehouse.
          </p>
        </div>
        <button onClick={() => setEditing('new')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Add warehouse
        </button>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4" />{error}
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No warehouses yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((w) => (
            <li key={w.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{w.name}</span>
                    {w.isDefault && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-primary">Default</span>
                    )}
                  </div>
                  {w.address && <div className="mt-0.5 text-xs text-muted-foreground">{w.address}{w.city ? `, ${w.city}` : ''}{w.postal ? ` ${w.postal}` : ''}</div>}
                  {w.phone && <div className="text-xs text-muted-foreground">{w.phone}</div>}
                </div>
                <div className="flex items-center gap-1">
                  {!w.isDefault && (
                    <button onClick={() => handleSetDefault(w)} title="Set default"
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => setEditing(w)} title="Edit"
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(w)} title="Delete"
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <WarehouseModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { await refresh(); setEditing(null); }}
        />
      )}
    </div>
  );
}

function WarehouseModal({ initial, onClose, onSaved }: {
  initial: Warehouse | null; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    address: initial?.address ?? '',
    city: initial?.city ?? '',
    postal: initial?.postal ?? '',
    phone: initial?.phone ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) { setErr('Name required'); return; }
    setBusy(true); setErr('');
    try {
      if (initial) await warehousesApi.update(initial.id, form);
      else await warehousesApi.create(form);
      await onSaved();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Save failed');
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">{initial ? 'Edit' : 'Add'} warehouse</h2>
        {err && <div className="mb-3 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          <Field label="Name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Main Warehouse" />
          <Field label="Address" value={form.address ?? ''} onChange={(v) => setForm({ ...form, address: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" value={form.city ?? ''} onChange={(v) => setForm({ ...form, city: v })} />
            <Field label="Postal" value={form.postal ?? ''} onChange={(v) => setForm({ ...form, postal: v })} />
          </div>
          <Field label="Phone" value={form.phone ?? ''} onChange={(v) => setForm({ ...form, phone: v })} />
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-border bg-background py-2 text-sm">Cancel</button>
            <button type="submit" disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required, value, onChange, placeholder }: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const id = `wh-${label.toLowerCase()}`;
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-xs font-medium">{label}{required && <span className="text-destructive"> *</span>}</span>
      <input id={id} type="text" required={required} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
    </label>
  );
}
