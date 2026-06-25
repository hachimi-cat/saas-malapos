'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { discountCodesApi, type DiscountCode, type DiscountType, type DiscountScope, type DiscountCreateInput } from '@/lib/marketing-api';
import { ProductMultiSelect } from '@/components/ui/product-multi-select';
import { CampaignSelect } from '@/components/marketing/campaign-select';
import { Loader2, Plus, X, Ticket, Pencil, Trash2, CheckCircle2, Clock, Eye, EyeOff } from 'lucide-react';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';

/**
 * /dashboard/marketing/discount-codes — create, edit, archive promo codes.
 *
 * Discount types cover both cart and shipping:
 *   - percent / fixed:            off cart subtotal
 *   - shipping_percent / fixed:   off shipping fee
 *
 * Scope controls WHICH items the percent/fixed base is computed over:
 *   - cart: full subtotal
 *   - products: only items whose productId is in the codes productIds
 *   - tags: only items whose product.tags overlap the code's tagFilter
 *
 * Shipping codes ignore scope (always apply to shipping fee).
 */

const TYPE_LABEL: Record<DiscountType, string> = {
  percent: '% off cart',
  fixed: 'Fixed off cart',
  shipping_percent: '% off shipping',
  shipping_fixed: 'Fixed off shipping',
};

const SCOPE_LABEL: Record<DiscountScope, string> = {
  cart: 'Whole cart',
  products: 'Specific products',
  tags: 'By tag',
};

export default function DiscountCodesPage() {
  const searchParams = useSearchParams();
  // Deep-link pre-fill: /dashboard/marketing/discount-codes?campaign=<id> auto-opens
  // the create modal with that campaign pre-selected. Used by the
  // campaign hub's "Add discount to this campaign" CTA so the merchant
  // doesn't have to re-pick the parent.
  const campaignParam = searchParams?.get('campaign') ?? null;
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<DiscountCode | 'new' | null>(null);

  // Auto-open create modal when arriving with ?campaign=<id>
  useEffect(() => {
    if (campaignParam && !editing) setEditing('new');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignParam]);

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await discountCodesApi.list({ limit: 100 });
      setCodes(res.data ?? []);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to load');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function archive(id: string) {
    if (!confirm('Deactivate this discount code? Past redemptions stay intact.')) return;
    try {
      await discountCodesApi.archive(id);
      await reload();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Archive failed');
    }
  }

  const columns: Column<DiscountCode>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      sortValue: (c) => c.code,
      searchValue: (c) => `${c.code} ${c.description ?? ''}`,
      cell: (c) => (
        <div>
          <div className="font-mono text-sm font-medium">{c.code}</div>
          {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      sortValue: (c) => c.type,
      cell: (c) => (
        <div className="text-xs">
          <div>{TYPE_LABEL[c.type]}</div>
          <div className="font-mono text-muted-foreground">
            {c.type === 'percent' || c.type === 'shipping_percent'
              ? `${c.value}%`
              : new Intl.NumberFormat('id-ID', { style: 'currency', currency: c.currency, minimumFractionDigits: 0 }).format(c.value)}
          </div>
        </div>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      sortable: true,
      sortValue: (c) => c.scope,
      cell: (c) => <span className="text-muted-foreground">{SCOPE_LABEL[c.scope]}</span>,
    },
    {
      key: 'used',
      header: 'Used',
      sortable: true,
      sortValue: (c) => c.redemptionCount,
      cell: (c) => (
        <span className="font-mono text-xs">
          {c.redemptionCount}{c.maxUsesTotal ? ` / ${c.maxUsesTotal}` : ''}
        </span>
      ),
    },
    {
      key: 'expires',
      header: 'Expires',
      sortable: true,
      sortValue: (c) => (c.expiresAt ? new Date(c.expiresAt).getTime() : 0),
      cell: (c) => (
        <span className="text-muted-foreground">
          {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('id-ID') : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (c) => (c.active ? 'active' : 'inactive'),
      cell: (c) => (
        <div className="flex flex-col gap-1">
          {c.active ? (
            <span className="inline-flex w-fit items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900">
              <CheckCircle2 className="h-3 w-3" /> Active
            </span>
          ) : (
            <span className="inline-flex w-fit items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <Clock className="h-3 w-3" /> Inactive
            </span>
          )}
          {c.public ? (
            <span className="inline-flex w-fit items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900" title="Shown on storefront">
              <Eye className="h-3 w-3" /> Public
            </span>
          ) : (
            <span className="inline-flex w-fit items-center gap-1 rounded bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground" title="Private — buyers must know the code">
              <EyeOff className="h-3 w-3" /> Private
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (c) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => setEditing(c)} title="Edit" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {c.active && (
            <button onClick={() => archive(c.id)} title="Deactivate" className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const filters: FilterDef<DiscountCode>[] = [
    {
      key: 'type',
      label: 'Type',
      accessor: (c) => c.type,
      options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
    },
    {
      key: 'active',
      label: 'Status',
      accessor: (c) => (c.active ? 'active' : 'inactive'),
      options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ],
    },
  ];

  if (loading) return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Discount codes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Promo codes for buyers. Redemptions post to the ledger as a promotion-cost debit, so
            P&amp;L shows discount expense separately.
          </p>
        </div>
        <button onClick={() => setEditing('new')}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> New code
        </button>
      </header>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {codes.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Ticket className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No discount codes yet. Create one to run your next promotion.</p>
        </div>
      ) : (
        <DataTable
          rows={codes}
          columns={columns}
          filters={filters}
          rowKey={(c) => c.id}
          searchPlaceholder="Search code, description…"
          defaultSort={{ key: 'code', dir: 'asc' }}
          empty="No discount codes match."
        />
      )}

      {editing && (
        <EditorModal
          editing={editing === 'new' ? null : editing}
          campaignPrefill={editing === 'new' ? campaignParam : null}
          onClose={() => setEditing(null)}
          onDone={async () => { setEditing(null); await reload(); }}
        />
      )}
    </div>
  );
}

function EditorModal({ editing, campaignPrefill, onClose, onDone }: { editing: DiscountCode | null; campaignPrefill: string | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [code, setCode] = useState(editing?.code ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [type, setType] = useState<DiscountType>(editing?.type ?? 'percent');
  const [value, setValue] = useState(String(editing?.value ?? '10'));
  const [currency, setCurrency] = useState(editing?.currency ?? 'IDR');
  const [scope, setScope] = useState<DiscountScope>(editing?.scope ?? 'cart');
  const [productIds, setProductIds] = useState<string[]>(editing?.productIds ?? []);
  const [tagFilter, setTagFilter] = useState((editing?.tagFilter ?? []).join(','));
  const [minPurchase, setMinPurchase] = useState(editing?.minPurchaseAmount ? String(editing.minPurchaseAmount) : '');
  const [maxUses, setMaxUses] = useState(editing?.maxUsesTotal ? String(editing.maxUsesTotal) : '');
  const [maxPerCustomer, setMaxPerCustomer] = useState(editing?.maxUsesPerCustomer ? String(editing.maxUsesPerCustomer) : '');
  const [startsAt, setStartsAt] = useState(editing?.startsAt ? editing.startsAt.slice(0, 10) : '');
  const [expiresAt, setExpiresAt] = useState(editing?.expiresAt ? editing.expiresAt.slice(0, 10) : '');
  const [active, setActive] = useState(editing?.active ?? true);
  const [isPublic, setIsPublic] = useState(editing?.public ?? false);
  const [marketingCampaignId, setMarketingCampaignId] = useState<string | null>(editing?.marketingCampaignId ?? campaignPrefill ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isPercent = type === 'percent' || type === 'shipping_percent';
  const isShipping = type === 'shipping_percent' || type === 'shipping_fixed';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = parseInt(value, 10);
    if (!Number.isFinite(v) || v <= 0) { setError('Value must be a positive integer'); return; }
    if (isPercent && (v < 1 || v > 100)) { setError('Percent must be 1-100'); return; }
    setBusy(true); setError('');
    const body: DiscountCreateInput = {
      code: code.trim().toUpperCase(),
      description: description.trim() || null,
      type,
      value: v,
      currency,
      scope,
      productIds: scope === 'products' ? productIds : [],
      tagFilter: scope === 'tags' ? tagFilter.split(',').map((s) => s.trim()).filter(Boolean) : [],
      minPurchaseAmount: minPurchase ? parseInt(minPurchase, 10) : null,
      maxUsesTotal: maxUses ? parseInt(maxUses, 10) : null,
      maxUsesPerCustomer: maxPerCustomer ? parseInt(maxPerCustomer, 10) : null,
      startsAt: startsAt ? new Date(`${startsAt}T00:00:00Z`).toISOString() : null,
      expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : null,
      active,
      public: isPublic,
      // Explicit null on detach so ripllo clears the FK; absent on no-op.
      marketingCampaignId,
    };
    try {
      if (editing) {
        await discountCodesApi.update(editing.id, body);
      } else {
        await discountCodesApi.create(body);
      }
      await onDone();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Save failed');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
        <header className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{editing ? `Edit ${editing.code}` : 'New discount code'}</h2>
            <p className="text-xs text-muted-foreground">
              {editing ? 'Code name is immutable after creation.' : 'Buyers enter this code at checkout to apply the discount.'}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </header>
        {error && <div className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="dc-code" className="mb-1 block text-xs font-medium">Code *</label>
              <input id="dc-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required disabled={!!editing}
                placeholder="LEBARAN25"
                className="w-full rounded border border-border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-70" />
            </div>
            <div>
              <label htmlFor="dc-desc" className="mb-1 block text-xs font-medium">Description</label>
              <input id="dc-desc" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Lebaran promo 2026"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as DiscountType)}
                className="w-full rounded border border-border bg-background px-2 py-2 text-sm">
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">{isPercent ? '% value' : 'Amount'}</label>
              <input type="number" min="1" max={isPercent ? 100 : undefined} value={value} onChange={(e) => setValue(e.target.value)}
                className="w-28 rounded border border-border bg-background px-2 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="rounded border border-border bg-background px-2 py-2 text-sm">
                <option>IDR</option>
                <option>USD</option>
              </select>
            </div>
          </div>
          {!isShipping && (
            <div>
              <label className="mb-1 block text-xs font-medium">Scope</label>
              <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
                {(['cart', 'products', 'tags'] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setScope(s)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${scope === s ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
                    {SCOPE_LABEL[s]}
                  </button>
                ))}
              </div>
              {scope === 'products' && (
                <div className="mt-2">
                  <ProductMultiSelect
                    label="Products"
                    value={productIds}
                    onChange={setProductIds}
                    placeholder="Pick products the code applies to…"
                  />
                </div>
              )}
              {scope === 'tags' && (
                <input value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}
                  placeholder="summer, sale (comma-separated tags)"
                  className="mt-2 w-full rounded border border-border bg-background px-3 py-2 text-sm" />
              )}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Min purchase</label>
              <input type="number" min="0" value={minPurchase} onChange={(e) => setMinPurchase(e.target.value)}
                placeholder="optional"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Max uses total</label>
              <input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)}
                placeholder="unlimited"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Max per customer</label>
              <input type="number" min="1" value={maxPerCustomer} onChange={(e) => setMaxPerCustomer(e.target.value)}
                placeholder="unlimited"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Starts</label>
              <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
                className="block w-[180px] rounded border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Expires</label>
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
                className="block w-[180px] rounded border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <CampaignSelect value={marketingCampaignId} onChange={setMarketingCampaignId} disabled={busy} />
          </div>
          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span className="font-medium">Active</span>
              <span className="text-xs text-muted-foreground">— buyers can enter this code at checkout</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="mt-0.5" />
              <div>
                <span className="font-medium">Show on storefront</span>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Display this code as a banner on the product list, product page, and cart so
                  buyers see the promo without needing to hear about it first.
                </p>
              </div>
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/70">Cancel</button>
            <button type="submit" disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
