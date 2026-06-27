'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Truck,
  PackageCheck,
  Send,
  Ban,
  ClipboardList,
} from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  DialogFooter,
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
    <Badge variant="outline" className={`rounded-full font-medium ${STATUS_STYLE[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

export default function PurchasingPage() {
  const [tab, setTab] = useState<'orders' | 'suppliers'>('orders');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight font-display">Purchasing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Restock from suppliers — raise purchase orders and receive stock into your outlets.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'orders' | 'suppliers')}>
        <TabsList className="mb-6">
          <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
        </TabsList>
        <TabsContent value="orders">
          <OrdersTab />
        </TabsContent>
        <TabsContent value="suppliers">
          <SuppliersTab />
        </TabsContent>
      </Tabs>
    </div>
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
        setOutlets(o.data.outlets ?? []);
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
            <Button
              key={s}
              variant="outline"
              onClick={() => changeFilter(s)}
              className={filter === s ? 'border-primary bg-primary/10 text-primary hover:bg-primary/10' : ''}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>
        <Button onClick={() => setBuilding(true)}>
          <Plus className="h-4 w-4" /> New PO
        </Button>
      </div>

      {loading ? (
        <div className="p-6 text-muted-foreground">Loading…</div>
      ) : orders.length === 0 ? (
        <Card className="p-12 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-medium font-display">No purchase orders</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Raise a PO to restock from a supplier.
          </p>
          <Button onClick={() => setBuilding(true)} className="mt-4">
            <Plus className="h-4 w-4" /> New PO
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((po) => (
                <TableRow key={po.id}>
                  <TableCell className="font-medium">{po.number}</TableCell>
                  <TableCell className="text-muted-foreground">{po.supplier?.name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{outletName(po.outletId)}</TableCell>
                  <TableCell>
                    <StatusBadge status={po.status} />
                  </TableCell>
                  <TableCell className="text-right font-medium">{rupiah(po.total)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {po.status === 'DRAFT' && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={acting === po.id}
                          onClick={() => act(po, 'order')}
                          title="Mark as ordered"
                        >
                          <Send className="h-3.5 w-3.5" /> Order
                        </Button>
                      )}
                      {(po.status === 'ORDERED' || po.status === 'PARTIAL') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setReceiving(po)}
                          title="Receive stock"
                        >
                          <PackageCheck className="h-3.5 w-3.5" /> Receive
                        </Button>
                      )}
                      {(po.status === 'DRAFT' || po.status === 'ORDERED') && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={acting === po.id}
                              title="Cancel"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel {po.number}?</AlertDialogTitle>
                              <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep order</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => act(po, 'cancel')}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Cancel order
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
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
        setSuppliers((s.data.suppliers ?? []).filter((x) => x.isActive));
        setProducts((p.data.products ?? []).filter((x) => x.variants.length));
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New purchase order</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Outlet">
            <Select
              value={outletId || '__none__'}
              onValueChange={(v) => setOutletId(v === '__none__' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {outlets.length === 0 && <SelectItem value="__none__">No outlets</SelectItem>}
                {outlets.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Supplier (optional)">
            <Select
              value={supplierId || '__none__'}
              onValueChange={(v) => setSupplierId(v === '__none__' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="mt-1">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Line items</span>
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-3.5 w-3.5" /> Add line
            </Button>
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
                        <Select
                          value={l.productId || undefined}
                          onValueChange={(v) => onProduct(l.key, v)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Pick product…" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-3">
                        <Select
                          value={l.variantId || undefined}
                          onValueChange={(v) => onVariant(l.key, l.productId, v)}
                          disabled={!prod}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Variant" />
                          </SelectTrigger>
                          <SelectContent>
                            {prod?.variants.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Input
                          type="number"
                          min={1}
                          value={l.quantity}
                          onChange={(e) => updateLine(l.key, { quantity: Math.max(0, Number(e.target.value)) })}
                          placeholder="Qty"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Input
                          type="number"
                          min={0}
                          value={l.cost}
                          onChange={(e) => updateLine(l.key, { cost: Math.max(0, Number(e.target.value)) })}
                          placeholder="Cost"
                        />
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 items-end gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-4">
                        <Input
                          value={l.batchNo}
                          onChange={(e) => updateLine(l.key, { batchNo: e.target.value })}
                          placeholder="Batch no. (optional)"
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <Input
                          type="date"
                          value={l.expiryDate}
                          onChange={(e) => updateLine(l.key, { expiryDate: e.target.value })}
                        />
                      </div>
                      <div className="flex items-center justify-end gap-3 sm:col-span-4">
                        <span className="text-sm font-medium">{rupiah((l.cost || 0) * (l.quantity || 0))}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(l.key)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Remove line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Field label="Note (optional)">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Internal note for this order"
          />
        </Field>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-base font-semibold text-primary">{rupiah(total)}</span>
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Create PO'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive stock</DialogTitle>
          <p className="text-sm text-muted-foreground">{po.number}</p>
        </DialogHeader>

        <div className="space-y-2">
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
                    <Input
                      type="number"
                      min={0}
                      max={outstanding}
                      value={row.receivedQty}
                      onChange={(e) => update(it.id, { receivedQty: Math.max(0, Number(e.target.value)) })}
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block text-muted-foreground">Batch no.</span>
                    <Input
                      value={row.batchNo}
                      onChange={(e) => update(it.id, { batchNo: e.target.value })}
                      placeholder="Optional"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block text-muted-foreground">Expiry</span>
                    <Input
                      type="date"
                      value={row.expiryDate}
                      onChange={(e) => update(it.id, { expiryDate: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={submit}>
            <PackageCheck className="h-4 w-4" />
            {busy ? 'Receiving…' : 'Receive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      setSuppliers(res.data.suppliers ?? []);
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
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Add supplier
        </Button>
      </div>

      {suppliers.length === 0 ? (
        <Card className="p-12 text-center">
          <Truck className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-medium font-display">No suppliers yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first supplier to raise purchase orders against them.
          </p>
          <Button onClick={() => setCreating(true)} className="mt-4">
            <Plus className="h-4 w-4" /> Add supplier
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.contact || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{s.phone || '—'}</TableCell>
                  <TableCell>
                    {s.isActive ? (
                      <Badge variant="outline" className="rounded-full border-primary/40 bg-primary/10 font-medium text-primary">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="rounded-full bg-muted font-medium text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(s)}
                        title="Edit"
                      >
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
                            <AlertDialogTitle>
                              Delete supplier &ldquo;{s.name}&rdquo;?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This can&apos;t be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => remove(s)}
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
            </TableBody>
          </Table>
        </Card>
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supplier ? 'Edit supplier' : 'New supplier'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Name">
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="PT Sumber Sehat"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact person">
              <Input
                value={form.contact}
                onChange={(e) => set('contact', e.target.value)}
                placeholder="Budi"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+62…"
              />
            </Field>
          </div>

          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="sales@supplier.co.id"
            />
          </Field>

          <Field label="Address">
            <Input
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Jl. Industri No. 5"
            />
          </Field>

          <Field label="Note">
            <Textarea
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              rows={2}
              placeholder="Payment terms, lead time, etc."
            />
          </Field>
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy ? 'Saving…' : supplier ? 'Save changes' : 'Create supplier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Shared                                                             */
/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 text-sm">
      <Label className="text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
