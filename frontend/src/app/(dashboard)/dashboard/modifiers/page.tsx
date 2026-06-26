'use client';

import { useEffect, useState } from 'react';
import { Plus, X, Pencil, Trash2, SlidersHorizontal } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';

/*
 * Modifiers manager — the back-office surface for F&B-style product
 * customization. A merchant builds modifier groups ("Sugar level", "Extra
 * shot") and the options within them, then attaches groups to products from
 * the product form's "Customization" section. Built against the real
 * /api/v1/modifiers endpoints; no mock data.
 */

type Modifier = {
  id: string;
  name: string;
  price: number;
  sortOrder: number;
  isActive: boolean;
};

type ModifierGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  modifiers: Modifier[];
};

export default function ModifiersPage() {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ModifierGroup | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const res = await api.get<{ groups: ModifierGroup[] }>('/modifiers');
      setGroups(res.data.groups);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onDeleteGroup(g: ModifierGroup) {
    if (!confirm(`Delete "${g.name}" and its options? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.delete(`/modifiers/${g.id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Delete failed');
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Modifiers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build customization groups (e.g. sugar level, extra shot), then attach them to
            products from the product form&apos;s Customization section.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New group
        </button>
      </div>

      <div className="mt-5 space-y-4">
        {groups.map((g) => (
          <GroupCard
            key={g.id}
            group={g}
            onEdit={() => setEditing(g)}
            onDelete={() => onDeleteGroup(g)}
            onChanged={load}
            onError={setError}
          />
        ))}
        {!groups.length && (
          <div className="rounded-lg border border-dashed border-border bg-card px-4 py-12 text-center text-muted-foreground">
            <SlidersHorizontal className="mx-auto mb-2 h-6 w-6 opacity-60" />
            No modifier groups yet. Create your first one.
          </div>
        )}
      </div>

      {(creating || editing) && (
        <GroupModal
          group={editing}
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

function GroupCard({
  group,
  onEdit,
  onDelete,
  onChanged,
  onError,
}: {
  group: ModifierGroup;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);

  const selectLabel =
    group.minSelect >= 1 && group.maxSelect === 1
      ? 'Required · pick 1'
      : group.maxSelect === 1
        ? 'Optional · pick 1'
        : `Pick ${group.minSelect}–${group.maxSelect}`;

  async function addModifier() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.post(`/modifiers/${group.id}/items`, {
        name,
        price: typeof newPrice === 'number' ? newPrice : 0,
      });
      setNewName('');
      setNewPrice('');
      await onChanged();
    } catch (e) {
      onError(e instanceof ApiRequestError ? e.message : 'Could not add option');
    } finally {
      setBusy(false);
    }
  }

  async function updateModifier(m: Modifier, patch: { name?: string; price?: number }) {
    try {
      await api.patch(`/modifiers/${group.id}/items/${m.id}`, patch);
      await onChanged();
    } catch (e) {
      onError(e instanceof ApiRequestError ? e.message : 'Update failed');
    }
  }

  async function deleteModifier(m: Modifier) {
    try {
      await api.delete(`/modifiers/${group.id}/items/${m.id}`);
      await onChanged();
    } catch (e) {
      onError(e instanceof ApiRequestError ? e.message : 'Delete failed');
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="font-medium">{group.name}</div>
          <div className="text-xs text-muted-foreground">{selectLabel}</div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
            title="Edit group"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-destructive"
            title="Delete group"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="divide-y divide-border">
        {group.modifiers.map((m) => (
          <ModifierRow
            key={m.id}
            modifier={m}
            onSave={(patch) => updateModifier(m, patch)}
            onDelete={() => deleteModifier(m)}
          />
        ))}
        {!group.modifiers.length && (
          <div className="px-4 py-3 text-xs text-muted-foreground">No options yet.</div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-background px-4 py-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addModifier())}
          placeholder="Option name (e.g. Less sugar)"
          className="min-w-0 flex-1 rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="number"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="+ Price"
          className="w-28 rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={addModifier}
          disabled={busy || !newName.trim()}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add option
        </button>
      </div>
    </div>
  );
}

function ModifierRow({
  modifier,
  onSave,
  onDelete,
}: {
  modifier: Modifier;
  onSave: (patch: { name?: string; price?: number }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(modifier.name);
  const [price, setPrice] = useState<number>(modifier.price);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    await onSave({ name: name.trim(), price });
    setBusy(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="number"
          value={price || ''}
          onChange={(e) => setPrice(Number(e.target.value))}
          className="w-28 rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={save}
          disabled={busy}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          Save
        </button>
        <button
          onClick={() => {
            setName(modifier.name);
            setPrice(modifier.price);
            setEditing(false);
          }}
          className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-accent/50">
      <span>{modifier.name}</span>
      <div className="flex items-center gap-3">
        <span className="font-medium text-muted-foreground">
          {modifier.price > 0 ? `+ ${rupiah(modifier.price)}` : 'Free'}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          title="Edit option"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="rounded p-1 text-muted-foreground hover:text-destructive"
          title="Delete option"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function GroupModal({
  group,
  onClose,
  onSaved,
}: {
  group: ModifierGroup | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const editing = !!group;
  const [name, setName] = useState(group?.name ?? '');
  const [required, setRequired] = useState((group?.minSelect ?? 0) >= 1);
  const [multi, setMulti] = useState((group?.maxSelect ?? 1) > 1);
  const [maxSelect, setMaxSelect] = useState(group?.maxSelect ?? 1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!name.trim()) {
      setErr('Name is required.');
      return;
    }
    // minSelect 1 when required, 0 otherwise. maxSelect 1 for single-select,
    // else the chosen cap (>= minSelect).
    const max = multi ? Math.max(2, maxSelect) : 1;
    const min = required ? 1 : 0;
    setBusy(true);
    try {
      const body = { name: name.trim(), minSelect: min, maxSelect: max };
      if (editing) {
        await api.patch(`/modifiers/${group!.id}`, body);
      } else {
        await api.post('/modifiers', body);
      }
      await onSaved();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{editing ? 'Edit group' : 'New modifier group'}</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <label className="block text-sm">
            <span className="text-muted-foreground">Name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sugar level"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            Required (customer must choose)
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={multi}
              onChange={(e) => setMulti(e.target.checked)}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            Allow multiple selections
          </label>

          {multi && (
            <label className="block text-sm">
              <span className="text-muted-foreground">Max selectable</span>
              <input
                type="number"
                min={2}
                value={maxSelect}
                onChange={(e) => setMaxSelect(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          )}
        </div>

        {err && <p className="mt-4 text-sm text-destructive">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create group'}
          </button>
        </div>
      </div>
    </div>
  );
}
