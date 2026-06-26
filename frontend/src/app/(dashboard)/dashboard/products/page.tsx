'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, X, Pencil, Trash2, Tag } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';

/*
 * Catalog manager — the back-office surface for Malapos's product list.
 * List + filter (by category, name search) the products that feed the sell
 * screen, then create/edit/delete them through a modal form with a variant
 * repeater. Categories are created inline. Built against the real backend;
 * no mock data.
 */

type Variant = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  cost: number | null;
  isActive: boolean;
  isComposite?: boolean;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  kind: 'GOODS' | 'SERVICE';
  trackStock: boolean;
  requiresBatch: boolean;
  imageUrl: string | null;
  isActive: boolean;
  variants: Variant[];
};

type Category = { id: string; name: string; sortOrder: number; isActive: boolean };

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const [p, c] = await Promise.all([
        api.get<{ products: Product[] }>('/products?active=true'),
        api.get<{ categories: Category[] }>('/categories'),
      ]);
      setProducts(p.data.products);
      setCategories(c.data.categories);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const catName = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) ?? '—' : '—');
  }, [categories]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryId && p.categoryId !== categoryId) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, query, categoryId]);

  async function onDelete(p: Product) {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.delete(`/products/${p.id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Delete failed');
    }
  }

  function priceRange(p: Product): string {
    const prices = p.variants.map((v) => v.price);
    if (!prices.length) return '—';
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? rupiah(min) : `${rupiah(min)} – ${rupiah(max)}`;
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your catalog — items, services, variants and categories.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add product
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded-md border border-input bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Kind</th>
              <th className="px-4 py-3 font-medium">Variants</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <ProductThumb name={p.name} imageUrl={p.imageUrl} className="h-9 w-9 shrink-0 rounded-md text-xs" />
                    <div className="min-w-0">
                      <div className="font-medium">{p.name}</div>
                      {(() => {
                        const code = p.variants[0]?.sku || p.variants[0]?.barcode;
                        return code ? <div className="font-mono text-[11px] text-muted-foreground">{code}</div> : null;
                      })()}
                      {p.description && (
                        <div className="line-clamp-1 text-xs text-muted-foreground">{p.description}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{catName(p.categoryId)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${
                      p.kind === 'SERVICE'
                        ? 'border-border text-muted-foreground'
                        : 'border-primary/40 bg-primary/10 text-primary'
                    }`}
                  >
                    {p.kind === 'SERVICE' ? 'Service' : 'Goods'}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.variants.length}</td>
                <td className="px-4 py-3 font-medium">{priceRange(p)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => setEditing(p)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDelete(p)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  {products.length ? 'No products match your filters.' : 'No products yet. Add your first one.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <ProductModal
          product={editing}
          categories={categories}
          onCategoryCreated={async () => {
            const c = await api.get<{ categories: Category[] }>('/categories');
            setCategories(c.data.categories);
          }}
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

type VariantDraft = {
  id?: string;
  name: string;
  price: number;
  cost: number | null;
  sku: string;
  barcode: string;
};

function ProductModal({
  product,
  categories,
  onCategoryCreated,
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: Category[];
  onCategoryCreated: () => Promise<void>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const editing = !!product;
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [kind, setKind] = useState<'GOODS' | 'SERVICE'>(product?.kind ?? 'GOODS');
  const [trackStock, setTrackStock] = useState(product?.trackStock ?? true);
  const [requiresBatch, setRequiresBatch] = useState(product?.requiresBatch ?? false);
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '');
  const [variants, setVariants] = useState<VariantDraft[]>(
    product?.variants.length
      ? product.variants.map((v) => ({
          id: v.id,
          name: v.name,
          price: v.price,
          cost: v.cost,
          sku: v.sku ?? '',
          barcode: v.barcode ?? '',
        }))
      : [{ name: 'Default', price: 0, cost: null, sku: '', barcode: '' }],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Adding a category inline.
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [catBusy, setCatBusy] = useState(false);

  function setKindAndStock(k: 'GOODS' | 'SERVICE') {
    setKind(k);
    // Services don't carry stock by default; goods do.
    setTrackStock(k === 'GOODS');
  }

  function updateVariant(i: number, patch: Partial<VariantDraft>) {
    setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }

  function addVariant() {
    setVariants((vs) => [...vs, { name: '', price: 0, cost: null, sku: '', barcode: '' }]);
  }

  function removeVariant(i: number) {
    setVariants((vs) => (vs.length <= 1 ? vs : vs.filter((_, idx) => idx !== i)));
  }

  async function createCategory() {
    const n = newCat.trim();
    if (!n) return;
    setCatBusy(true);
    setErr(null);
    try {
      const res = await api.post<{ category: Category }>('/categories', { name: n });
      await onCategoryCreated();
      setCategoryId(res.data.category.id);
      setNewCat('');
      setShowNewCat(false);
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Could not create category');
    } finally {
      setCatBusy(false);
    }
  }

  async function submit() {
    setErr(null);
    if (!name.trim()) {
      setErr('Name is required.');
      return;
    }
    if (!editing && !variants.some((v) => v.price > 0)) {
      setErr('Add at least one variant with a price.');
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        // PATCH only mutates product-level fields (variants are managed elsewhere).
        await api.patch(`/products/${product!.id}`, {
          name: name.trim(),
          description: description.trim() || undefined,
          categoryId: categoryId || null,
          kind,
          trackStock,
          requiresBatch,
        });
      } else {
        await api.post('/products', {
          name: name.trim(),
          description: description.trim() || undefined,
          categoryId: categoryId || undefined,
          kind,
          trackStock,
          requiresBatch,
          imageUrl: imageUrl.trim() || undefined,
          variants: variants.map((v) => ({
            name: v.name.trim() || undefined,
            sku: v.sku.trim() || undefined,
            barcode: v.barcode.trim() || undefined,
            price: v.price,
            cost: v.cost ?? undefined,
          })),
        });
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
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{editing ? 'Edit product' : 'New product'}</h2>
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
              placeholder="e.g. Paracetamol 500mg"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted-foreground">Description (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-muted-foreground">Category (optional)</span>
              {showNewCat ? (
                <div className="mt-1 flex gap-2">
                  <input
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), createCategory())}
                    placeholder="New category name"
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={createCategory}
                    disabled={catBusy || !newCat.trim()}
                    className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
                  >
                    {catBusy ? '…' : 'Add'}
                  </button>
                  <button
                    onClick={() => { setShowNewCat(false); setNewCat(''); }}
                    className="rounded-md border border-border px-2 text-sm text-muted-foreground hover:bg-accent"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">No category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewCat(true)}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border px-2 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Tag className="h-3.5 w-3.5" /> + new
                  </button>
                </div>
              )}
            </label>

            <label className="block text-sm">
              <span className="text-muted-foreground">Kind</span>
              <select
                value={kind}
                onChange={(e) => setKindAndStock(e.target.value as 'GOODS' | 'SERVICE')}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="GOODS">Goods</option>
                <option value="SERVICE">Service</option>
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <Toggle
              checked={trackStock}
              onChange={setTrackStock}
              label="Track stock"
            />
            <Toggle
              checked={requiresBatch}
              onChange={setRequiresBatch}
              label="Track batches/expiry (pharmacy)"
            />
          </div>

          {!editing && (
            <label className="block text-sm">
              <span className="text-muted-foreground">Image URL (optional)</span>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          )}

          {editing ? (
            <>
              <p className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                Variants and pricing are not editable here. This form updates the product&apos;s
                core details only.
              </p>
              <RecipeEditor product={product!} />
            </>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Variants</span>
                <button
                  type="button"
                  onClick={addVariant}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add variant
                </button>
              </div>
              <div className="space-y-2">
                {variants.map((v, i) => (
                  <div key={i} className="rounded-md border border-border bg-background p-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <input
                        value={v.name}
                        onChange={(e) => updateVariant(i, { name: e.target.value })}
                        placeholder="Name (Default)"
                        className="rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        type="number"
                        value={v.price || ''}
                        onChange={(e) => updateVariant(i, { price: Number(e.target.value) })}
                        placeholder="Price"
                        className="rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        type="number"
                        value={v.cost ?? ''}
                        onChange={(e) =>
                          updateVariant(i, { cost: e.target.value === '' ? null : Number(e.target.value) })
                        }
                        placeholder="Cost"
                        className="rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <div className="flex gap-2">
                        <input
                          value={v.sku}
                          onChange={(e) => updateVariant(i, { sku: e.target.value })}
                          placeholder="SKU"
                          className="min-w-0 flex-1 rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                        <button
                          type="button"
                          onClick={() => removeVariant(i)}
                          disabled={variants.length <= 1}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-30"
                          title="Remove variant"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <input
                      value={v.barcode}
                      onChange={(e) => updateVariant(i, { barcode: e.target.value })}
                      placeholder="Barcode (optional)"
                      className="mt-2 w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                ))}
              </div>
            </div>
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
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </div>
    </div>
  );
}

type RecipeComponentRow = {
  id?: string;
  componentVariantId: string;
  componentName?: string;
  quantity: number;
  unit: string;
};

type VariantOption = { id: string; label: string };

/*
 * Composite / bill-of-materials editor for a single-variant product. A
 * composite ("recipe", "bundle", "kit", compounded item) tracks no stock of
 * its own — selling it deducts each component. Generic across F&B, retail and
 * pharmacy: decimal quantities + free-text units cover break-bulk too.
 */
function RecipeEditor({ product }: { product: Product }) {
  // Recipe is managed per-variant; the editor targets the product's first
  // variant (the common single-variant case for composites — bundles/recipes).
  const variant = product.variants[0];
  const [isComposite, setIsComposite] = useState(false);
  const [rows, setRows] = useState<RecipeComponentRow[]>([]);
  const [options, setOptions] = useState<VariantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!variant) {
        setLoading(false);
        return;
      }
      try {
        const [recipe, all] = await Promise.all([
          api.get<{ isComposite: boolean; components: RecipeComponentRow[] }>(
            `/products/${product.id}/variants/${variant.id}/recipe`,
          ),
          api.get<{ products: Product[] }>('/products?active=true'),
        ]);
        if (cancelled) return;
        setIsComposite(recipe.data.isComposite);
        setRows(
          recipe.data.components.map((c) => ({
            id: c.id,
            componentVariantId: c.componentVariantId,
            componentName: c.componentName,
            quantity: c.quantity,
            unit: c.unit ?? '',
          })),
        );
        // Candidate components: every active variant except this one and other
        // composites (no nesting).
        const opts: VariantOption[] = [];
        for (const p of all.data.products) {
          for (const v of p.variants) {
            if (v.id === variant.id) continue;
            if (v.isComposite) continue;
            opts.push({
              id: v.id,
              label: `${p.name}${v.name && v.name !== 'Default' ? ` — ${v.name}` : ''}`,
            });
          }
        }
        setOptions(opts);
      } catch (e) {
        if (!cancelled) setErr(e instanceof ApiRequestError ? e.message : 'Failed to load recipe');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [product.id, variant?.id]);

  function addRow() {
    setRows((rs) => [...rs, { componentVariantId: '', quantity: 1, unit: '' }]);
  }
  function updateRow(i: number, patch: Partial<RecipeComponentRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!variant) return;
    setErr(null);
    setMsg(null);
    const components = rows
      .filter((r) => r.componentVariantId && r.quantity > 0)
      .map((r) => ({
        componentVariantId: r.componentVariantId,
        quantity: r.quantity,
        unit: r.unit.trim() || undefined,
      }));
    if (isComposite && !components.length) {
      setErr('A composite needs at least one component.');
      return;
    }
    setBusy(true);
    try {
      await api.put(`/products/${product.id}/variants/${variant.id}/recipe`, {
        isComposite,
        components,
      });
      setMsg('Recipe saved.');
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  if (!variant) return null;

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Recipe / components</span>
        <Toggle checked={isComposite} onChange={setIsComposite} label="Composite item" />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        A composite (recipe, bundle, kit, compounded item) holds no stock of its own — selling it
        deducts each component. Use decimals + a unit for break-bulk (e.g. 0.01 “box”).
      </p>

      {isComposite && (
        <div className="mt-3 space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (
            <>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <select
                    value={r.componentVariantId}
                    onChange={(e) => updateRow(i, { componentVariantId: e.target.value })}
                    className="col-span-6 min-w-0 rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select component…</option>
                    {r.componentVariantId &&
                      !options.some((o) => o.id === r.componentVariantId) && (
                        <option value={r.componentVariantId}>{r.componentName ?? r.componentVariantId}</option>
                      )}
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="any"
                    value={r.quantity || ''}
                    onChange={(e) => updateRow(i, { quantity: Number(e.target.value) })}
                    placeholder="Qty"
                    className="col-span-3 min-w-0 rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    value={r.unit}
                    onChange={(e) => updateRow(i, { unit: e.target.value })}
                    placeholder="Unit"
                    className="col-span-2 min-w-0 rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="col-span-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                    title="Remove component"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add component
              </button>
            </>
          )}
        </div>
      )}

      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      {msg && <p className="mt-2 text-xs text-primary">{msg}</p>}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={busy || loading}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save recipe'}
        </button>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm"
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-input'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span>{label}</span>
    </button>
  );
}

// Product thumbnail with a graceful fallback: when there's no imageUrl or the
// image fails to load, show the product's initial on a muted tile.
function ProductThumb({ name, imageUrl, className }: { name: string; imageUrl: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        onError={() => setFailed(true)}
        className={`object-cover ${className ?? ''}`}
      />
    );
  }
  return (
    <div className={`flex items-center justify-center bg-muted font-semibold text-muted-foreground ${className ?? ''}`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
