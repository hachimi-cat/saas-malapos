'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Boxes, X, Plus, RotateCcw } from 'lucide-react';
import {
  inventoryApi,
  warehousesApi,
  type FulkrumaProduct,
  type FulkrumaVariant,
  type VariantStock,
  type Warehouse,
  type StockMovementReason,
} from '@/lib/fulfillment-api';
import { ApiRequestError } from '@/lib/api';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';
import { FulfillmentModuleOff } from '@/components/fulfillment/module-off';

/*
 * Fulfillment → Inventory. malapos port of storlaunch's fulfillment/
 * inventory page over /api/v1/fulfillment/inventory. This is the FULKRUMA
 * warehouse inventory — the Fulkruma products/variants and their
 * per-warehouse stock levels, with manual adjustments. It is DISTINCT from
 * malapos's own POS inventory at /dashboard/inventory (untouched here).
 */

const REASONS: { value: StockMovementReason; label: string }[] = [
  { value: 'manual_adjust', label: 'Manual adjustment' },
  { value: 'initial_stock', label: 'Initial stock' },
  { value: 'refund_restock', label: 'Refund restock' },
  { value: 'transfer_in', label: 'Transfer in' },
  { value: 'transfer_out', label: 'Transfer out' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'returned_to_supplier', label: 'Returned to supplier' },
  { value: 'import', label: 'Import' },
];

interface Row {
  product: FulkrumaProduct;
  variant: FulkrumaVariant;
  stock: VariantStock[];
  total: number;
}

export default function InventoryPage() {
  const [products, setProducts] = useState<FulkrumaProduct[]>([]);
  const [stock, setStock] = useState<VariantStock[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [error, setError] = useState('');
  const [adjust, setAdjust] = useState<Row | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [prodRes, stockRes, whRes] = await Promise.all([
        inventoryApi.listProducts(),
        inventoryApi.listStock(),
        warehousesApi.list(),
      ]);
      setProducts(prodRes.data ?? []);
      setStock(stockRes.data ?? []);
      setWarehouses(whRes.data ?? []);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) setModuleOff(true);
      else setError(e instanceof ApiRequestError ? e.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo<Row[]>(() => {
    const byVariant = new Map<string, VariantStock[]>();
    for (const s of stock) {
      const arr = byVariant.get(s.variantId) ?? [];
      arr.push(s);
      byVariant.set(s.variantId, arr);
    }
    const out: Row[] = [];
    for (const product of products) {
      for (const variant of product.variants ?? []) {
        if (variant.archived) continue;
        const vs = byVariant.get(variant.id) ?? [];
        out.push({ product, variant, stock: vs, total: vs.reduce((n, s) => n + s.quantity, 0) });
      }
    }
    return out;
  }, [products, stock]);

  const columns: Column<Row>[] = [
    {
      key: 'product',
      header: 'Product',
      sortable: true,
      sortValue: (r) => r.product.name,
      searchValue: (r) => `${r.product.name} ${r.variant.name} ${r.variant.sku ?? ''}`,
      cell: (r) => <span className="font-medium">{r.product.name}</span>,
    },
    {
      key: 'variant',
      header: 'Variant',
      sortable: true,
      sortValue: (r) => r.variant.name,
      cell: (r) => <span className="text-muted-foreground">{r.variant.name}</span>,
    },
    {
      key: 'sku',
      header: 'SKU',
      sortable: true,
      sortValue: (r) => r.variant.sku ?? '',
      cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.variant.sku ?? '—'}</span>,
    },
    {
      key: 'total',
      header: 'In stock',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.total,
      cell: (r) => <span className={r.total <= 0 ? 'text-destructive' : 'tabular-nums'}>{r.total}</span>,
    },
    {
      key: 'warehouses',
      header: 'Warehouses',
      cell: (r) =>
        r.stock.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {r.stock.map((s) => (
              <span key={s.id} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {s.warehouse?.name ?? s.warehouseId.slice(-6)}: {s.quantity}
              </span>
            ))}
          </div>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <button
          type="button"
          onClick={() => setAdjust(r)}
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted"
        >
          <Plus className="h-3 w-3" /> Adjust
        </button>
      ),
    },
  ];

  const filters: FilterDef<Row>[] = [
    { key: 'product', label: 'Product', accessor: (r) => r.product.name },
  ];

  if (moduleOff) return <FulfillmentModuleOff blurb="Inventory tracks Fulkruma warehouse stock per variant. Turn on the Fulfillment module to manage it." />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fulkruma warehouse stock per product variant. Separate from your POS stock under{' '}
            <a href="/dashboard/inventory" className="text-primary hover:underline">Catalog → Inventory</a>.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="flex items-center gap-2 rounded border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted">
          <RotateCcw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      {error && <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Boxes className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No Fulkruma variants yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">Fulfillment products + variants appear here once created in Fulkruma.</p>
        </div>
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          filters={filters}
          rowKey={(r) => r.variant.id}
          searchPlaceholder="Search product, variant, SKU…"
          defaultSort={{ key: 'product', dir: 'asc' }}
          empty="No variants match."
        />
      )}

      {adjust && (
        <AdjustModal
          row={adjust}
          warehouses={warehouses}
          onClose={() => setAdjust(null)}
          onSaved={async () => {
            setAdjust(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function AdjustModal({ row, warehouses, onClose, onSaved }: {
  row: Row; warehouses: Warehouse[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const defaultWh = row.stock[0]?.warehouseId ?? warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? '';
  const [warehouseId, setWarehouseId] = useState(defaultWh);
  const [delta, setDelta] = useState('0');
  const [reason, setReason] = useState<StockMovementReason>('manual_adjust');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = Number(delta);
    if (!warehouseId) { setErr('Pick a warehouse'); return; }
    if (!Number.isInteger(d) || d === 0) { setErr('Delta must be a non-zero integer'); return; }
    setBusy(true);
    setErr('');
    try {
      await inventoryApi.adjust({ variantId: row.variant.id, warehouseId, delta: d, reason, note: note || undefined });
      await onSaved();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Adjustment failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Adjust stock</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{row.product.name} · {row.variant.name}</p>
        {err && <div className="mb-3 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Warehouse</span>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">— Select —</option>
              {warehouses.map((w) => (<option key={w.id} value={w.id}>{w.name}{w.isDefault ? ' (default)' : ''}</option>))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Delta (+/-)</span>
            <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} className="w-full rounded border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value as StockMovementReason)} className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              {REASONS.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Note (optional)</span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </label>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-border bg-background py-2 text-sm">Cancel</button>
            <button type="submit" disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
