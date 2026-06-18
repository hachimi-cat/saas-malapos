'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Truck,
  PackageCheck,
  X,
  Send,
  Ban,
  ClipboardList,
} from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';

/*
 * Purchasing — restocking from suppliers. Two tabs:
 *  - Purchase Orders: build a draft PO (outlet + supplier + line items priced
 *    from each variant's cost), then push it through DRAFT → ORDERED → (PARTIAL)
 *    → RECEIVED, receiving stock against each line with optional batch/expiry for
 *    pharmacy. CANCELLED is terminal.
 *  - Suppliers: a thin CRUD address book (name/contact/phone) the POs draw from.
 * Built against the real backend; no mock data.
 */

type Supplier = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  isActive: boolean;
};

type Outlet = { id: string; name: string };

type Variant = { id: string; name: string; price: number; cost: number };
type Product = { id: string; name: string; variants: Variant[] };

type POStatus = 'DRAFT' | 'ORDERED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

type POItem = {
  id: string;
  variantId: string;
  quantity: number;
  receivedQty: number;
  cost: number;
  batchNo: string | null;
  expiryDate: string | null;
};

type PurchaseOrder = {
  id: string;
  number: string;
  status: POStatus;
  total: number;
  outletId: string;
  supplier?: Supplier | null;
  createdAt: string;
  items: POItem[];
};

const STATUSES: (POStatus | 'ALL')[] = ['ALL', 'DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'];

const STATUS_STYLE: Record<POStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ORDERED: 'bg-primary/10 text-primary',
  PARTIAL: 'bg-amber-500/10 text-amber-600',
  RECEIVED: 'bg-emerald-500/10 text-emerald-600',
  CANCELLED: 'bg-destructive/10 text-destructive',
};

function StatusBadge({ status }: { status: POStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

export default function PurchasingPage() {
  const [tab, setTab] = useState<'orders' | 'suppliers'>('orders');

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Purchasing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Restock from suppliers — raise purchase orders and receive stock into your outlets.
        </p>
      </div>

      <div className="mb-6 flex gap-1 border-b border-border">
        <TabButton active={tab === 'orders'} onClick={() => setTab('orders')}>
          Purchase Orders
        </TabButton>
        <TabButton active={tab === 'suppliers'} onClick={() => setTab('suppliers')}>
          Suppliers
        </TabButton>
      </div>

      {tab === 'orders' ? <OrdersTab /> : <SuppliersTab />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Purchase Orders tab                                                */
/* ------------------------------------------------------------------ */

function OrdersTab() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<POStatus | 'ALL'>('ALL');
  const [building, setBuilding] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  async function loadOrders(status: POStatus | 'ALL' = filter) {
    try {
      const qs = status === 'ALL' ? '' : `?status=${status}`;
      const res = await api.get<{ items?: PurchaseOrder[] } | PurchaseOrder[]>(`/purchase-orders${qs}`);
      const data = res.data as { items?: PurchaseOrder[] } | PurchaseOrder[];
      const items = Array.isArray(data) ? data : (data.items ?? []);
      setOrders(items);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const o = await api.get<{ outlets: Outlet[] }>('/outlets');
        setOutlets(o.data.outlets);
      } catch {
        /* outlet load failure surfaces when building */
      }
      await loadOrders('ALL');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeFilter(next: POStatus | 'ALL') {
    setFilter(next);
    setLoading(true);
    loadOrders(next);
  }

  async function act(po: PurchaseOrder, action: 'order' | 'cancel') {
    if (action === 'cancel' && !confirm(`Cancel ${po.number}? This can't be undone.`)) return;
    setActing(po.id);
    setError(null);
    try {
      await api.post(`/purchase-orders/${po.id}/${action}`);
      await loadOrders();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : `Failed to ${action} purchase order`);
    } finally {
      setActing(null);
    }
  }

  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? '—';

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => changeFilter(s)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === s ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'
              }`}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <button
          onClick={() => setBuilding(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New PO
        </button>
      </div>

      {loading ? (
        <div className="p-6 text-muted-foreground">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-medium">No purchase orders</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Raise a PO to restock from a supplier.
          </p>
          <button
            onClick={() => setBuilding(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New PO
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Outlet</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orders.map((po) => (
                <tr key={po.id} className="border-b border-border last:border-0 hover:bg-accent">
                  <td className="px-4 py-3 font-medium">{po.number}</td>
                  <td className="px-4 py-3 text-muted-foreground">{po.supplier?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{outletName(po.outletId)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={po.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{rupiah(po.total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {po.status === 'DRAFT' && (
                        <button
                          disabled={acting === po.id}
                          onClick={() => act(po, 'order')}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background disabled:opacity-40"
                          title="Mark as ordered"
                        >
                          <Send className="h-3.5 w-3.5" /> Order
                        </button>
                      )}
                      {(po.status === 'ORDERED' || po.status === 'PARTIAL') && (
                        <button
                          onClick={() => setReceiving(po)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background"
                          title="Receive stock"
                        >
                          <PackageCheck className="h-3.5 w-3.5" /> Receive
                        </button>
                      )}
                      {(po.status === 'DRAFT' || po.status === 'ORDERED') && (
                        <button
                          disabled={acting === po.id}
                          onClick={() => act(po, 'cancel')}
                          className="inline-flex items-center gap-1 rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-destructive disabled:opacity-40"
                          title="Cancel"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {building && (
        <POBuilderModal
          outlets={outlets}
          onClose={() => setBuilding(false)}
          onSaved={async () => {
            setBuilding(false);
            setLoading(true);
            await loadOrders();
          }}
        />
      )}

      {receiving && (
        <ReceiveModal
          po={receiving}
          onClose={() => setReceiving(null)}
          onSaved={async () => {
            setReceiving(null);
            setLoading(true);
            await loadOrders();
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

/* ------------------------------------------------------------------ */
/* PO builder modal                                                   */
/* ------------------------------------------------------------------ */

type DraftLine = {
  key: string;
  productId: string;
  variantId: string;
  quantity: number;
  cost: number;
  batchNo: string;
  expiryDate: string;
};

function newLineKey() {
  return Math.random().toString(36).slice(2);
}

function POBuilderModal({
  outlets,
  onClose,
  onSaved,
}: {
  outlets: Outlet[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? '');
  const [supplierId, setSupplierId] = useState('');
  const [note, setNote] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, p] = await Promise.all([
          api.get<{ suppliers: Supplier[] }>('/suppliers'),
          api.get<{ products: Product[] }>('/products?active=true'),
        ]);
        setSuppliers(s.data.suppliers.filter((x) => x.isActive));
        setProducts(p.data.products.filter((x) => x.variants.length));
      } catch (e) {
        setErr(e instanceof ApiRequestError ? e.message : 'Failed to load form data');
      }
    })();
  }, []);

  function addLine() {
    setLines((l) => [
      ...l,
      { key: newLineKey(), productId: '', variantId: '', quantity: 1, cost: 0, batchNo: '', expiryDate: '' },
    ]);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((l) => l.map((ln) => (ln.key === key ? { ...ln, ...patch } : ln)));
  }

  function removeLine(key: string) {
    setLines((l) => l.filter((ln) => ln.key !== key));
  }

  function onProduct(key: string, productId: string) {
    const prod = products.find((p) => p.id === productId);
    const firstVariant = prod?.variants[0];
    updateLine(key, {
      productId,
      variantId: firstVariant?.id ?? '',
      cost: firstVariant?.cost ?? 0,
    });
  }

  function onVariant(key: string, productId: string, variantId: string) {
    const prod = products.find((p) => p.id === productId);
    const variant = prod?.variants.find((v) => v.id === variantId);
    updateLine(key, { variantId, cost: variant?.cost ?? 0 });
  }

  const total = useMemo(
    () => lines.reduce((s, l) => s + (l.cost || 0) * (l.quantity || 0), 0),
    [lines],
  );

  async function save() {
    setErr(null);
    if (!outletId) {
      setErr('Pick an outlet.');
      return;
    }
    const valid = lines.filter((l) => l.variantId && l.quantity > 0);
    if (!valid.length) {
      setErr('Add at least one line item with a product and quantity.');
      return;
    }
    setBusy(true);
    const body = {
      outletId,
      supplierId: supplierId || undefined,
      note: note.trim() || undefined,
      items: valid.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
        cost: l.cost,
        batchNo: l.batchNo.trim() || undefined,
        expiryDate: l.expiryDate || undefined,
      })),
    };
    try {
      await api.post<{ purchaseOrder: PurchaseOrder }>('/purchase-orders', body);
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Failed to create purchase order');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">New purchase order</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Outlet">
            <select
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {outlets.length === 0 && <option value="">No outlets</option>}
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Supplier (optional)">
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— None —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Line items</span>
            <button
              onClick={addLine}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5" /> Add line
            </button>
          </div>

          {lines.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No items yet. Add a line to start.
            </p>
          ) : (
            <div className="space-y-2">
              {lines.map((l) => {
                const prod = products.find((p) => p.id === l.productId);
                return (
                  <div key={l.key} className="rounded-md border border-border p-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-5">
                        <select
                          value={l.productId}
                          onChange={(e) => onProduct(l.key, e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="">Pick product…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <select
                          value={l.variantId}
                          onChange={(e) => onVariant(l.key, l.productId, e.target.value)}
                          disabled={!prod}
                          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                        >
                          {!prod && <option value="">Variant</option>}
                          {prod?.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min={1}
                          value={l.quantity}
                          onChange={(e) => updateLine(l.key, { quantity: Math.max(0, Number(e.target.value)) })}
                          placeholder="Qty"
                          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min={0}
                          value={l.cost}
                          onChange={(e) => updateLine(l.key, { cost: Math.max(0, Number(e.target.value)) })}
                          placeholder="Cost"
                          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 items-end gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-4">
                        <input
                          value={l.batchNo}
                          onChange={(e) => updateLine(l.key, { batchNo: e.target.value })}
                          placeholder="Batch no. (optional)"
                          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <input
                          type="date"
                          value={l.expiryDate}
                          onChange={(e) => updateLine(l.key, { expiryDate: e.target.value })}
                          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-3 sm:col-span-4">
                        <span className="text-sm font-medium">{rupiah((l.cost || 0) * (l.quantity || 0))}</span>
                        <button
                          onClick={() => removeLine(l.key)}
                          className="rounded p-1 text-muted-foreground hover:text-destructive"
                          title="Remove line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Field label="Note (optional)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Internal note for this order"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-base font-semibold text-primary">{rupiah(total)}</span>
        </div>

        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={save}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Create PO'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Receive modal                                                      */
/* ------------------------------------------------------------------ */

type ReceiveLine = { itemId: string; receivedQty: number; batchNo: string; expiryDate: string };

function ReceiveModal({
  po,
  onClose,
  onSaved,
}: {
  po: PurchaseOrder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<ReceiveLine[]>(() =>
    po.items.map((it) => ({
      itemId: it.id,
      receivedQty: Math.max(0, it.quantity - it.receivedQty),
      batchNo: it.batchNo ?? '',
      expiryDate: it.expiryDate ? it.expiryDate.slice(0, 10) : '',
    })),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function update(itemId: string, patch: Partial<ReceiveLine>) {
    setRows((r) => r.map((row) => (row.itemId === itemId ? { ...row, ...patch } : row)));
  }

  async function submit() {
    setErr(null);
    const items = rows
      .filter((r) => r.receivedQty > 0)
      .map((r) => ({
        itemId: r.itemId,
        receivedQty: r.receivedQty,
        batchNo: r.batchNo.trim() || undefined,
        expiryDate: r.expiryDate || undefined,
      }));
    if (!items.length) {
      setErr('Enter a received quantity for at least one line.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/purchase-orders/${po.id}/receive`, { items });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Failed to receive stock');
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
          <div>
            <h2 className="text-lg font-semibold">Receive stock</h2>
            <p className="text-sm text-muted-foreground">{po.number}</p>
          </div>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {po.items.map((it) => {
            const row = rows.find((r) => r.itemId === it.id)!;
            const outstanding = Math.max(0, it.quantity - it.receivedQty);
            return (
              <div key={it.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Variant {it.variantId}</span>
                  <span className="text-muted-foreground">
                    {it.receivedQty}/{it.quantity} received · {outstanding} outstanding
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <label className="block text-xs">
                    <span className="mb-1 block text-muted-foreground">Receive qty</span>
                    <input
                      type="number"
                      min={0}
                      max={outstanding}
                      value={row.receivedQty}
                      onChange={(e) => update(it.id, { receivedQty: Math.max(0, Number(e.target.value)) })}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block text-muted-foreground">Batch no.</span>
                    <input
                      value={row.batchNo}
                      onChange={(e) => update(it.id, { batchNo: e.target.value })}
                      placeholder="Optional"
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block text-muted-foreground">Expiry</span>
                    <input
                      type="date"
                      value={row.expiryDate}
                      onChange={(e) => update(it.id, { expiryDate: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={submit}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            <PackageCheck className="h-4 w-4" />
            {busy ? 'Receiving…' : 'Receive'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Suppliers tab                                                      */
/* ------------------------------------------------------------------ */

type SupplierForm = {
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  note: string;
};

const emptySupplier: SupplierForm = { name: '', contact: '', phone: '', email: '', address: '', note: '' };

function toSupplierForm(s: Supplier): SupplierForm {
  return {
    name: s.name,
    contact: s.contact ?? '',
    phone: s.phone ?? '',
    email: s.email ?? '',
    address: s.address ?? '',
    note: s.note ?? '',
  };
}

function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const res = await api.get<{ suppliers: Supplier[] }>('/suppliers');
      setSuppliers(res.data.suppliers);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(s: Supplier) {
    if (!confirm(`Delete supplier "${s.name}"? This can't be undone.`)) return;
    setError(null);
    try {
      await api.delete(`/suppliers/${s.id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to delete supplier');
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add supplier
        </button>
      </div>

      {suppliers.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Truck className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-medium">No suppliers yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first supplier to raise purchase orders against them.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add supplier
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-accent">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.contact || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditing(s)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(s)}
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
        <SupplierModal
          supplier={editing}
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

function SupplierModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<SupplierForm>(supplier ? toSupplierForm(supplier) : emptySupplier);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.name.trim()) {
      setErr('Name is required.');
      return;
    }
    setBusy(true);
    setErr(null);
    const body = {
      name: form.name.trim(),
      contact: form.contact.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      note: form.note.trim() || null,
    };
    try {
      if (supplier) {
        await api.patch<{ supplier: Supplier }>(`/suppliers/${supplier.id}`, body);
      } else {
        await api.post<{ supplier: Supplier }>('/suppliers', body);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Failed to save supplier');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{supplier ? 'Edit supplier' : 'New supplier'}</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <Field label="Name">
            <input
              autoFocus
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="PT Sumber Sehat"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact person">
              <input
                value={form.contact}
                onChange={(e) => set('contact', e.target.value)}
                placeholder="Budi"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
            <Field label="Phone">
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+62…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
          </div>

          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="sales@supplier.co.id"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>

          <Field label="Address">
            <input
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Jl. Industri No. 5"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>

          <Field label="Note">
            <textarea
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              rows={2}
              placeholder="Payment terms, lead time, etc."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
        </div>

        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={save}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Saving…' : supplier ? 'Save changes' : 'Create supplier'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared                                                             */
/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
