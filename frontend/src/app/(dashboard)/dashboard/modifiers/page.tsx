'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Pencil, Trash2, SlidersHorizontal, Loader2 } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';
import { PageHeader } from '@/components/dashboard/page-header';
import {
  PageAssistant,
  AgenticEntry,
  BulkEditSlot,
} from '@/components/catentio/agentic-entry';
import { useCatentioStatus } from '@/hooks/use-catentio';
import { deleteMany } from '@/lib/bulk';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
  // Batch edit (agentic sheet) + batch delete, over the card selection.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const { enabled: assistantEnabled } = useCatentioStatus();

  async function load() {
    try {
      const res = await api.get<{ groups: ModifierGroup[] }>('/modifiers');
      setGroups(res.data.groups ?? []);
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
    setError(null);
    try {
      await api.delete(`/modifiers/${g.id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Delete failed');
    }
  }

  // Selected cards as bulk targets: `id` for the write, `name` for a
  // named failure line, and the descriptor fields so the edit sheet's
  // manual form pre-fills.
  const bulkTargets = useMemo(
    () => groups.filter((g) => selected.has(g.id)),
    [groups, selected],
  );

  async function onBulkDelete() {
    setBulkError(null);
    setBulkDeleting(true);
    try {
      await deleteMany(
        bulkTargets.map((g) => ({ id: g.id, label: g.name })),
        (id) => api.delete(`/modifiers/${id}`),
      );
      setSelected(new Set());
      await load();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : 'Some groups could not be deleted');
      await load();
    } finally {
      setBulkDeleting(false);
    }
  }

  function toggleGroup(id: string, checked: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div>
      <PageHeader
        title="Modifiers"
        description={
          <>
            Build customization groups (e.g. sugar level, extra shot), then attach them to
            products from the product form&apos;s Customization section.
          </>
        }
        action={
          <div className="flex items-center gap-2">
            <PageAssistant resource="modifiers" onApplied={load} />
            <AgenticEntry
              resource="modifiers"
              mode="create"
              onApplied={load}
              fallback={
                <Button onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" /> New group
                </Button>
              }
            >
              <span className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
                <Plus className="h-4 w-4" /> New group
              </span>
            </AgenticEntry>
          </div>
        }
      />

      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
          <span className="text-sm font-medium">
            {selected.size === 1 ? '1 group selected' : `${selected.size} groups selected`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {assistantEnabled && (
              <Button variant="outline" onClick={() => setBulkEditing(true)} disabled={bulkDeleting}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={bulkDeleting}
                >
                  {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete {selected.size} {selected.size === 1 ? 'group' : 'groups'}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Each group is deleted with its options. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onBulkDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="ghost" onClick={() => setSelected(new Set())} disabled={bulkDeleting}>
              Clear
            </Button>
          </div>
          {bulkError && (
            <p className="w-full text-xs text-destructive">{bulkError}</p>
          )}
        </div>
      )}

      {bulkEditing && (
        <BulkEditSlot
          resource="modifiers"
          targets={bulkTargets}
          onClose={() => setBulkEditing(false)}
          onApplied={async () => {
            setBulkEditing(false);
            setSelected(new Set());
            await load();
          }}
        />
      )}

      <div className="mt-5 space-y-4">
        {groups.map((g) => (
          <GroupCard
            key={g.id}
            group={g}
            selected={selected.has(g.id)}
            onSelect={(checked) => toggleGroup(g.id, checked)}
            onEdit={() => setEditing(g)}
            onDelete={() => onDeleteGroup(g)}
            onChanged={load}
            onError={setError}
          />
        ))}
        {!groups.length && (
          <Card className="border-dashed px-4 py-12 text-center text-muted-foreground">
            <SlidersHorizontal className="mx-auto mb-2 h-6 w-6 opacity-60" />
            No modifier groups yet. Create your first one.
          </Card>
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
  selected,
  onSelect,
  onEdit,
  onDelete,
  onChanged,
  onError,
}: {
  group: ModifierGroup;
  selected: boolean;
  onSelect: (checked: boolean) => void;
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
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onSelect(v === true)}
            aria-label={`Select ${group.name}`}
          />
          <div className="min-w-0">
            <div className="font-medium">{group.name}</div>
            <div className="text-xs text-muted-foreground">{selectLabel}</div>
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} title="Edit group">
            <Pencil className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                title="Delete group"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete &ldquo;{group.name}&rdquo;?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete the group and its options. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addModifier())}
          placeholder="Option name (e.g. Less sugar)"
          className="min-w-0 flex-1"
        />
        <Input
          type="number"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="+ Price"
          className="w-28"
        />
        <Button
          type="button"
          variant="outline"
          onClick={addModifier}
          disabled={busy || !newName.trim()}
        >
          <Plus className="h-4 w-4" /> Add option
        </Button>
      </div>
    </Card>
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
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1"
        />
        <Input
          type="number"
          value={price || ''}
          onChange={(e) => setPrice(Number(e.target.value))}
          className="w-28"
        />
        <Button size="sm" onClick={save} disabled={busy}>
          Save
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            setName(modifier.name);
            setPrice(modifier.price);
            setEditing(false);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
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
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setEditing(true)}
          title="Edit option"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          title="Delete option"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit group' : 'New modifier group'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mod-name">Name</Label>
            <Input
              id="mod-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sugar level"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="mod-required"
              checked={required}
              onCheckedChange={(c) => setRequired(c === true)}
            />
            <Label htmlFor="mod-required" className="font-normal">
              Required (customer must choose)
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="mod-multi"
              checked={multi}
              onCheckedChange={(c) => setMulti(c === true)}
            />
            <Label htmlFor="mod-multi" className="font-normal">
              Allow multiple selections
            </Label>
          </div>

          {multi && (
            <div className="space-y-1.5">
              <Label htmlFor="mod-max">Max selectable</Label>
              <Input
                id="mod-max"
                type="number"
                min={2}
                value={maxSelect}
                onChange={(e) => setMaxSelect(Number(e.target.value))}
              />
            </div>
          )}
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
