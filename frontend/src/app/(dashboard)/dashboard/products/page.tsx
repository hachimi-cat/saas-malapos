'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Search, Plus, X, Pencil, Trash2, Tag, Upload, Loader2 } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
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
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Add product
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="pl-9"
          />
        </div>
        <Select
          value={categoryId || 'all'}
          onValueChange={(v) => setCategoryId(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-auto min-w-[10rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="mt-4 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead>Price</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
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
                </TableCell>
                <TableCell className="text-muted-foreground">{catName(p.categoryId)}</TableCell>
                <TableCell>
                  {p.kind === 'SERVICE' ? (
                    <Badge variant="outline" className="rounded-full text-muted-foreground">
                      Service
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full border-primary/40 bg-primary/10 text-primary">
                      Goods
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{p.variants.length}</TableCell>
                <TableCell className="font-medium">{priceRange(p)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(p)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(p)}
                      title="Delete"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  {products.length ? 'No products match your filters.' : 'No products yet. Add your first one.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

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

/**
 * Product-image upload. Asks the backend for a presigned public-read PUT
 * URL (`POST /uploads/sign`), uploads the file straight to DO Spaces, then
 * stores the resulting public URL in `imageUrl`. The PUT MUST send exactly
 * the headers the presign signed — `Content-Type` + `x-amz-acl: public-read`
 * — or Spaces returns 403. A small "or paste URL" field stays as a fallback.
 */
function ImageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  async function upload(file: File) {
    if (!file.type.startsWith('image/')) {
      setUploadErr('Pick an image file (JPG / PNG / WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadErr('Image too large — max 5MB.');
      return;
    }
    setUploadErr(null);
    setUploading(true);
    try {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : undefined;
      const { data } = await api.post<{
        key: string;
        url: string;
        publicUrl: string;
        contentType: string;
      }>('/uploads/sign', { contentType: file.type, ext });
      // Direct-to-Spaces PUT. Use the signed content-type and the
      // public-read ACL header the presign signed — both, exactly.
      const put = await fetch(data.url, {
        method: 'PUT',
        headers: { 'Content-Type': data.contentType, 'x-amz-acl': 'public-read' },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      onChange(data.publicUrl);
    } catch (e) {
      setUploadErr(e instanceof ApiRequestError ? e.message : (e as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-1 space-y-2">
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Product"
              className="h-16 w-16 rounded-md border border-border object-cover"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => onChange('')}
              aria-label="Remove image"
              className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border bg-background text-muted-foreground">
            <Upload className="h-4 w-4" />
          </div>
        )}
        <Button asChild variant="outline" size="sm">
          <label className="cursor-pointer">
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {value ? 'Replace image' : 'Upload image'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = '';
              }}
            />
          </label>
        </Button>
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="…or paste an image URL"
      />
      {uploadErr && <p className="text-xs text-destructive">{uploadErr}</p>}
    </div>
  );
}

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
  const [variants, setVariants] = useState<VariantDraft[]>(() => {
    // Only active variants are editable; soft-deactivated ones (kept for sales
    // history) stay hidden so they don't reappear as rows on re-edit.
    const active = product?.variants.filter((v) => v.isActive) ?? [];
    return active.length
      ? active.map((v) => ({
          id: v.id,
          name: v.name,
          price: v.price,
          cost: v.cost,
          sku: v.sku ?? '',
          barcode: v.barcode ?? '',
        }))
      : [{ name: 'Default', price: 0, cost: null, sku: '', barcode: '' }];
  });
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
    if (!variants.some((v) => v.price > 0)) {
      setErr('Add at least one variant with a price.');
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        // PATCH now reconciles variants too: existing rows carry their id
        // (update), new rows omit it (create), and removed rows are dropped
        // server-side (soft-deactivated if they have sales history).
        await api.patch(`/products/${product!.id}`, {
          name: name.trim(),
          description: description.trim() || undefined,
          categoryId: categoryId || null,
          kind,
          trackStock,
          requiresBatch,
          // Empty clears the image (schema is nullish); a value sets it.
          imageUrl: imageUrl.trim() || null,
          variants: variants.map((v) => ({
            id: v.id,
            name: v.name.trim() || undefined,
            // Send null (not undefined) so clearing a code persists.
            sku: v.sku.trim() || null,
            barcode: v.barcode.trim() || null,
            price: v.price,
            cost: v.cost ?? undefined,
          })),
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit product' : 'New product'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="prod-name">Name</Label>
            <Input
              id="prod-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Paracetamol 500mg"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prod-desc">Description (optional)</Label>
            <Textarea
              id="prod-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category (optional)</Label>
              {showNewCat ? (
                <div className="flex gap-2">
                  <Input
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), createCategory())}
                    placeholder="New category name"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    onClick={createCategory}
                    disabled={catBusy || !newCat.trim()}
                  >
                    {catBusy ? '…' : 'Add'}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => { setShowNewCat(false); setNewCat(''); }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Select
                    value={categoryId || 'none'}
                    onValueChange={(v) => setCategoryId(v === 'none' ? '' : v)}
                  >
                    <SelectTrigger className="min-w-0 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No category</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewCat(true)}
                    className="whitespace-nowrap text-muted-foreground"
                  >
                    <Tag className="h-3.5 w-3.5" /> + new
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prod-kind">Kind</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKindAndStock(v as 'GOODS' | 'SERVICE')}
              >
                <SelectTrigger id="prod-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GOODS">Goods</SelectItem>
                  <SelectItem value="SERVICE">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

          <div className="space-y-1.5">
            <Label>Image (optional)</Label>
            <ImageField value={imageUrl} onChange={setImageUrl} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Variants</span>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={addVariant}
                className="h-auto p-0"
              >
                <Plus className="h-3.5 w-3.5" /> Add variant
              </Button>
            </div>
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={v.id ?? `new-${i}`} className="rounded-md border border-border bg-background p-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Input
                      value={v.name}
                      onChange={(e) => updateVariant(i, { name: e.target.value })}
                      placeholder="Name (Default)"
                      className="h-8 bg-card text-sm"
                    />
                    <Input
                      type="number"
                      value={v.price || ''}
                      onChange={(e) => updateVariant(i, { price: Number(e.target.value) })}
                      placeholder="Price"
                      className="h-8 bg-card text-sm"
                    />
                    <Input
                      type="number"
                      value={v.cost ?? ''}
                      onChange={(e) =>
                        updateVariant(i, { cost: e.target.value === '' ? null : Number(e.target.value) })
                      }
                      placeholder="Cost"
                      className="h-8 bg-card text-sm"
                    />
                    <div className="flex gap-2">
                      <Input
                        value={v.sku}
                        onChange={(e) => updateVariant(i, { sku: e.target.value })}
                        placeholder="SKU"
                        className="h-8 min-w-0 flex-1 bg-card text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeVariant(i)}
                        disabled={variants.length <= 1}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title="Remove variant"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Input
                    value={v.barcode}
                    onChange={(e) => updateVariant(i, { barcode: e.target.value })}
                    placeholder="Barcode (optional)"
                    className="mt-2 h-8 bg-card text-sm"
                  />
                </div>
              ))}
            </div>
            {editing && (
              <p className="mt-2 text-xs text-muted-foreground">
                Removing a variant that has sales history keeps it for reporting (it&apos;s
                deactivated, not deleted) so past receipts stay intact.
              </p>
            )}
          </div>

          {editing && (
            <>
              <ModifierAttachEditor product={product!} />
              <RecipeEditor product={product!} />
            </>
          )}
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
                  <Select
                    value={r.componentVariantId || undefined}
                    onValueChange={(v) => updateRow(i, { componentVariantId: v })}
                  >
                    <SelectTrigger className="col-span-6 h-8 min-w-0 bg-card text-sm">
                      <SelectValue placeholder="Select component…" />
                    </SelectTrigger>
                    <SelectContent>
                      {r.componentVariantId &&
                        !options.some((o) => o.id === r.componentVariantId) && (
                          <SelectItem value={r.componentVariantId}>
                            {r.componentName ?? r.componentVariantId}
                          </SelectItem>
                        )}
                      {options.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="any"
                    value={r.quantity || ''}
                    onChange={(e) => updateRow(i, { quantity: Number(e.target.value) })}
                    placeholder="Qty"
                    className="col-span-3 h-8 min-w-0 bg-card text-sm"
                  />
                  <Input
                    value={r.unit}
                    onChange={(e) => updateRow(i, { unit: e.target.value })}
                    placeholder="Unit"
                    className="col-span-2 h-8 min-w-0 bg-card text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(i)}
                    className="col-span-1 h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Remove component"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={addRow}
                className="h-auto p-0"
              >
                <Plus className="h-3.5 w-3.5" /> Add component
              </Button>
            </>
          )}
        </div>
      )}

      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      {msg && <p className="mt-2 text-xs text-primary">{msg}</p>}

      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={save}
          disabled={busy || loading}
        >
          {busy ? 'Saving…' : 'Save recipe'}
        </Button>
      </div>
    </div>
  );
}

type ModGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  modifiers: { id: string; name: string; price: number; isActive: boolean }[];
};

/*
 * Customization editor — attach/detach the merchant's modifier groups
 * (e.g. "Sugar level", "Extra shot") to this product. F&B-oriented but
 * available for any product. Reads every group + the product's current
 * attachments, then PUTs the full checked set (replace-all semantics, the
 * shape `PUT /modifiers/product/:id` expects).
 */
function ModifierAttachEditor({ product }: { product: Product }) {
  const [groups, setGroups] = useState<ModGroup[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [all, attached] = await Promise.all([
          api.get<{ groups: ModGroup[] }>('/modifiers'),
          api.get<{ groups: ModGroup[] }>(`/modifiers/product/${product.id}`),
        ]);
        if (cancelled) return;
        setGroups(all.data.groups);
        setChecked(new Set(attached.data.groups.map((g) => g.id)));
      } catch (e) {
        if (!cancelled) setErr(e instanceof ApiRequestError ? e.message : 'Failed to load modifiers');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      // Preserve the listing order for the attached groups.
      const groupIds = groups.filter((g) => checked.has(g.id)).map((g) => g.id);
      await api.put(`/modifiers/product/${product.id}`, { groupIds });
      setMsg('Customization saved.');
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <span className="text-sm font-medium">Customization</span>
      <p className="mt-1 text-xs text-muted-foreground">
        Tick the modifier groups that apply to this product (e.g. sugar level, extra shot).
        Manage the groups themselves on the{' '}
        <a href="/dashboard/modifiers" className="text-primary hover:underline">Modifiers</a> page.
      </p>

      {loading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No modifier groups yet. Create one on the{' '}
          <a href="/dashboard/modifiers" className="text-primary hover:underline">Modifiers</a> page.
        </p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {groups.map((g) => (
            <label
              key={g.id}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm"
            >
              <Checkbox
                checked={checked.has(g.id)}
                onCheckedChange={() => toggle(g.id)}
              />
              <span className="font-medium">{g.name}</span>
              <span className="text-xs text-muted-foreground">
                {g.modifiers.length} option{g.modifiers.length === 1 ? '' : 's'} · {g.minSelect}–{g.maxSelect} select
              </span>
            </label>
          ))}
        </div>
      )}

      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      {msg && <p className="mt-2 text-xs text-primary">{msg}</p>}

      {groups.length > 0 && (
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={save}
            disabled={busy || loading}
          >
            {busy ? 'Saving…' : 'Save customization'}
          </Button>
        </div>
      )}
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
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="font-normal">{label}</Label>
    </div>
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
