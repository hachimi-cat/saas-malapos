'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Boxes, Plus, RotateCcw } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

/*
 * Fulfillment → Inventory. malapos port of storlaunch's fulfillment/
 * inventory page over /api/v1/fulfillment/inventory. This is the FULKRUMA
 * warehouse inventory — the Fulkruma products/variants and their
 * per-warehouse stock levels, with manual adjustments. It is DISTINCT from
 * malapos's own POS inventory at /dashboard/inventory (untouched here).
 */

const NO_WH = '__none__';

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
        <Button variant="outline" size="sm" onClick={() => setAdjust(r)}>
          <Plus className="h-3 w-3" /> Adjust
        </Button>
      ),
    },
  ];

  const filters: FilterDef<Row>[] = [
    { key: 'product', label: 'Product', accessor: (r) => r.product.name },
  ];

  if (moduleOff) return <FulfillmentModuleOff blurb="Inventory tracks Fulkruma warehouse stock per variant. Turn on the Fulfillment module to manage it." />;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fulkruma warehouse stock per product variant. Separate from your POS stock under{' '}
            <a href="/dashboard/inventory" className="text-primary hover:underline">Catalog → Inventory</a>.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          <RotateCcw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </header>

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {loading ? (
        <Card className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-12 text-center">
          <Boxes className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No Fulkruma variants yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">Fulfillment products + variants appear here once created in Fulkruma.</p>
        </Card>
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{row.product.name} · {row.variant.name}</p>
        {err && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Warehouse</Label>
            <Select value={warehouseId === '' ? NO_WH : warehouseId} onValueChange={(v) => setWarehouseId(v === NO_WH ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="— Select —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_WH}>— Select —</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}{w.isDefault ? ' (default)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delta">Delta (+/-)</Label>
            <Input id="delta" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as StockMovementReason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Note (optional)</Label>
            <Input id="note" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
