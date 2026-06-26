'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Utensils, X, Store } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useBusinessType } from '@/hooks/use-business-type';

/*
 * Tables manager — define the dine-in floor for an F&B outlet. List every
 * table at the selected outlet (label, zone, seats, active state) and
 * create / edit / delete them. A table becomes "occupied" when a sale is
 * held on it (open bill) from the sell screen. F&B-only surface; built
 * against the real backend, no mock data.
 */

type Outlet = { id: string; name: string };

type Table = {
  id: string;
  outletId: string;
  label: string;
  zone: string | null;
  seats: number | null;
  sortOrder: number;
  isActive: boolean;
};

type FormState = { label: string; zone: string; seats: string; sortOrder: string };

const empty: FormState = { label: '', zone: '', seats: '', sortOrder: '' };

function toForm(t: Table): FormState {
  return {
    label: t.label,
    zone: t.zone ?? '',
    seats: t.seats != null ? String(t.seats) : '',
    sortOrder: String(t.sortOrder),
  };
}

export default function TablesPage() {
  const { isFnb, loading: btLoading } = useBusinessType();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState('');
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Table | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ outlets: Outlet[] }>('/outlets');
        setOutlets(res.data.outlets);
        setOutletId(res.data.outlets[0]?.id ?? '');
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load outlets');
        setLoading(false);
      }
    })();
  }, []);

  async function load(id: string) {
    if (!id) {
      setTables([]);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get<{ tables: Table[] }>(`/tables?outletId=${encodeURIComponent(id)}&includeInactive=true`);
      setTables(res.data.tables);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load tables');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (outletId) load(outletId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId]);

  async function remove(t: Table) {
    if (!confirm(`Delete table "${t.label}"?`)) return;
    setError(null);
    try {
      await api.delete(`/tables/${t.id}`);
      await load(outletId);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to delete table');
    }
  }

  if (btLoading || loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  if (!isFnb) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <Utensils className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-semibold">Tables are an F&amp;B feature</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set your business type to <strong>F&amp;B</strong> under{' '}
          <a href="/dashboard/settings" className="text-primary underline">Settings</a> to manage a dine-in floor.
        </p>
      </div>
    );
  }

  if (!outlets.length) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <Store className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-semibold">No outlet yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a store under <a href="/dashboard/outlets" className="text-primary underline">Outlets</a> first, then add its tables.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Tables</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your dine-in floor. Seat orders on a table from the sell screen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {outlets.length > 1 && (
            <select
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add table
          </button>
        </div>
      </div>

      {tables.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Utensils className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-medium">No tables yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add your first table to start seating dine-in orders.</p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add table
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Zone</th>
                <th className="px-4 py-3 font-medium">Seats</th>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-accent">
                  <td className="px-4 py-3 font-medium">{t.label}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.zone || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.seats != null ? t.seats : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.sortOrder}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {t.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditing(t)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(t)}
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
        <TableModal
          outletId={outletId}
          table={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await load(outletId);
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

function TableModal({
  outletId,
  table,
  onClose,
  onSaved,
}: {
  outletId: string;
  table: Table | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(table ? toForm(table) : empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.label.trim()) {
      setErr('Label is required.');
      return;
    }
    setBusy(true);
    setErr(null);

    const seats = form.seats.trim() === '' ? null : Math.max(0, Math.round(Number(form.seats)));
    const sortOrder = form.sortOrder.trim() === '' ? 0 : Math.max(0, Math.round(Number(form.sortOrder)));

    try {
      if (table) {
        await api.patch<{ table: Table }>(`/tables/${table.id}`, {
          label: form.label.trim(),
          zone: form.zone.trim() || null,
          seats,
          sortOrder,
        });
      } else {
        await api.post<{ table: Table }>('/tables', {
          outletId,
          label: form.label.trim(),
          zone: form.zone.trim() || null,
          seats,
          sortOrder,
        });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Failed to save table');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{table ? 'Edit table' : 'New table'}</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <Field label="Label">
            <input
              autoFocus
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="Table 5"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Zone">
              <input
                value={form.zone}
                onChange={(e) => set('zone', e.target.value)}
                placeholder="Indoor"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
            <Field label="Seats">
              <input
                type="number"
                min={0}
                value={form.seats}
                onChange={(e) => set('seats', e.target.value)}
                placeholder="4"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
          </div>

          <Field label="Sort order">
            <input
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(e) => set('sortOrder', e.target.value)}
              placeholder="0"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
        </div>

        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={save}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Saving…' : table ? 'Save changes' : 'Create table'}
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
