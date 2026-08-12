'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { PageHeader } from '@/components/dashboard/page-header';
import { AgenticEntry, BulkEditSlot } from '@/components/catentio/agentic-entry';
import { ActionsDropdown, type PageAction } from '@/components/dashboard/actions-dropdown';
import { BulkBar, BulkDeleteDialog } from '@/components/dashboard/bulk-bar';
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
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/*
 * Categories manager — the back-office surface for catalog grouping.
 * Categories were previously only creatable as a side effect of editing a
 * product, so a merchant could never rename, reorder, retire or delete one.
 * This page owns that lifecycle. The order set here is the order the sell
 * screen renders its filter chips and grouped product sections in, so moving
 * the busiest category to the top directly speeds up the cashier.
 * Built against the real /api/v1/categories endpoints; no mock data.
 */

type Category = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  // Set while a reorder round-trip is in flight so the arrows can't be
  // double-fired into a conflicting order.
  const [reordering, setReordering] = useState(false);
  // Batch edit (agentic sheet) + batch delete, over the row selection.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const { enabled: assistantEnabled } = useCatentioStatus();

  async function load() {
    try {
      const c = await api.get<{ categories: Category[] }>('/categories');
      setCategories(c.data.categories ?? []);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(c: Category, isActive: boolean) {
    setError(null);
    // Optimistic — the switch should feel instant; revert if the call fails.
    setCategories((list) => list.map((x) => (x.id === c.id ? { ...x, isActive } : x)));
    try {
      await api.patch(`/categories/${c.id}`, { isActive });
    } catch (e) {
      setCategories((list) => list.map((x) => (x.id === c.id ? { ...x, isActive: c.isActive } : x)));
      setError(e instanceof ApiRequestError ? e.message : 'Could not update category');
    }
  }

  /*
   * Move one row up/down and persist the whole ordering. Arrow buttons rather
   * than drag-and-drop: no new dependency, and they stay usable on the touch
   * screens these merchants actually run the back office on.
   */
  async function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= categories.length || reordering) return;
    const before = categories;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next);
    setReordering(true);
    setError(null);
    try {
      await api.post('/categories/reorder', { ids: next.map((c) => c.id) });
    } catch (e) {
      setCategories(before);
      setError(e instanceof ApiRequestError ? e.message : 'Could not save the new order');
    } finally {
      setReordering(false);
    }
  }

  async function onDelete(c: Category) {
    setError(null);
    try {
      await api.delete(`/categories/${c.id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Delete failed');
    }
  }

  // Selected rows as bulk targets: `id` for the write, `name` for a
  // named failure line, and the descriptor fields so the edit sheet's
  // manual form pre-fills.
  const bulkTargets = useMemo(
    () => categories.filter((c) => selected.has(c.id)),
    [categories, selected],
  );

  // The bulk-delete EXECUTOR — called by the Actions dropdown's confirm
  // (BulkDeleteDialog). Throwing surfaces deleteMany's partial-failure
  // sentence, which the BulkBar renders; the selection persists on a
  // partial run so the failed rest can be retried.
  async function onBulkDelete() {
    try {
      await deleteMany(
        bulkTargets.map((c) => ({ id: c.id, label: c.name })),
        (id) => api.delete(`/categories/${id}`),
      );
    } finally {
      await load();
    }
  }

  function toggleRow(id: string, checked: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      for (const c of categories) {
        if (checked) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  // The page's batch verbs, on the Actions dropdown beside "Add
  // category" (bang's entry-point contract). Labels recompute per
  // render so the counts stay live.
  const pageActions: PageAction[] = [
    ...(assistantEnabled
      ? [{
          key: 'bulk-edit',
          label: bulkTargets.length > 0 ? `Bulk edit ${bulkTargets.length} selected` : 'Bulk edit',
          icon: Pencil,
          run: () => setBulkEditing(true),
          requiresSelection: true,
        }]
      : []),
    {
      key: 'bulk-delete',
      label: bulkTargets.length > 0 ? `Delete ${bulkTargets.length} selected` : 'Delete selected',
      icon: Trash2,
      run: () => setBulkDeleteOpen(true),
      requiresSelection: true,
      destructive: true,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Group your products so the sell screen finds them faster. This order is the order cashiers see on the sell screen."
        action={
          <div className="flex items-center gap-2">
            <ActionsDropdown
              actions={pageActions}
              selectionCount={bulkTargets.length}
              noun="category"
            />
            <AgenticEntry
              resource="categories"
              mode="create"
              split
              onApplied={load}
              className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              fallback={
                <Button onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" /> Add category
                </Button>
              }
            >
              <Plus className="h-4 w-4" /> Add category
            </AgenticEntry>
          </div>
        }
      />

      {bulkEditing && (
        <BulkEditSlot
          resource="categories"
          targets={bulkTargets}
          onClose={() => setBulkEditing(false)}
          onApplied={async () => {
            setBulkEditing(false);
            setSelected(new Set());
            await load();
          }}
        />
      )}

      <Card className="mt-4 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    categories.length > 0 && categories.every((c) => selected.has(c.id))
                      ? true
                      : categories.some((c) => selected.has(c.id))
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={(v) => toggleAll(v === true)}
                  aria-label="Select all categories"
                />
              </TableHead>
              <TableHead className="w-24">Order</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Products</TableHead>
              <TableHead>Shown on sell</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c, i) => (
              <TableRow key={c.id} data-state={selected.has(c.id) ? 'selected' : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(c.id)}
                    onCheckedChange={(v) => toggleRow(c.id, v === true)}
                    aria-label={`Select ${c.name}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={i === 0 || reordering}
                      onClick={() => move(i, -1)}
                      title="Move up"
                      aria-label={`Move ${c.name} up`}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={i === categories.length - 1 || reordering}
                      onClick={() => move(i, 1)}
                      title="Move down"
                      aria-label={`Move ${c.name} down`}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.productCount === 1 ? '1 product' : `${c.productCount} products`}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={c.isActive}
                    onCheckedChange={(v) => toggleActive(c, v)}
                    aria-label={`Show ${c.name} on the sell screen`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(c)} title="Rename">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete &ldquo;{c.name}&rdquo;?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {c.productCount > 0
                              ? `${c.productCount === 1 ? 'The 1 product' : `The ${c.productCount} products`} in this category will be kept but become uncategorized. This cannot be undone.`
                              : 'This cannot be undone.'}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onDelete(c)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!categories.length && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No categories yet. Add one, then assign products to it from the Products page.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <BulkBar
        count={bulkTargets.length}
        noun="category"
        plural="categories"
        onClear={() => { setBulkError(null); setSelected(new Set()); }}
        error={bulkError}
      />

      <BulkDeleteDialog
        count={bulkTargets.length}
        noun="category"
        plural="categories"
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        onDelete={onBulkDelete}
        onError={setBulkError}
        onDone={() => setSelected(new Set())}
        description="This cannot be undone. Products in a deleted category are kept but become uncategorized."
      />

      {(creating || editing) && (
        <CategoryModal
          category={editing}
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

/** Create / rename dialog. `category` null = create. */
function CategoryModal({
  category,
  onClose,
  onSaved,
}: {
  category: Category | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const n = name.trim();
    if (!n) {
      setErr('Name is required');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (category) await api.patch(`/categories/${category.id}`, { name: n });
      else await api.post('/categories', { name: n });
      await onSaved();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Could not save category');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? 'Rename category' : 'New category'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="category-name">Name</Label>
          <Input
            id="category-name"
            value={name}
            autoFocus
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), save())}
            placeholder="e.g. Drinks"
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {category ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
