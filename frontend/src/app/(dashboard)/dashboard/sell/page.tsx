'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Minus, Trash2, Receipt, X } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';

/*
 * The sell screen — Malapos's hero surface. Pick an outlet, search/scan the
 * catalog into a cart, then take payment (cash with change, QRIS, card). On
 * confirm it POSTs /sales (which deducts stock + earns loyalty server-side)
 * and shows the receipt. Built against the real backend; no mock data.
 */

type Variant = { id: string; name: string; price: number; sku: string | null; barcode: string | null };
type Product = { id: string; name: string; kind: string; isActive: boolean; variants: Variant[] };
type Outlet = { id: string; name: string; taxRateBps: number };
type Customer = { id: string; name: string; phone: string | null };

type CartLine = { variantId: string; productId: string; name: string; variantName: string; unitPrice: number; qty: number };

type Sale = {
  id: string;
  number: string;
  total: number;
  changeTotal: number;
  items: { productName: string; quantity: number; lineTotal: number }[];
};

export default function SellPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [o, p] = await Promise.all([
          api.get<{ outlets: Outlet[] }>('/outlets'),
          api.get<{ products: Product[] }>('/products?active=true'),
        ]);
        setOutlets(o.data.outlets);
        setOutletId(o.data.outlets[0]?.id ?? '');
        setProducts(p.data.products.filter((x) => x.isActive && x.variants.length));
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const outlet = outlets.find((o) => o.id === outletId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.variants.some((v) => v.sku?.toLowerCase().includes(q) || v.barcode?.includes(q)),
    );
  }, [products, query]);

  function addVariant(p: Product, v: Variant) {
    setReceipt(null);
    setCart((c) => {
      const found = c.find((l) => l.variantId === v.id);
      if (found) return c.map((l) => (l.variantId === v.id ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...c,
        { variantId: v.id, productId: p.id, name: p.name, variantName: v.name, unitPrice: v.price, qty: 1 },
      ];
    });
  }

  function setQty(variantId: string, qty: number) {
    setCart((c) =>
      qty <= 0 ? c.filter((l) => l.variantId !== variantId) : c.map((l) => (l.variantId === variantId ? { ...l, qty } : l)),
    );
  }

  // If the query exactly matches a barcode, Enter adds it (scanner flow).
  function onSearchKey(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return;
    const code = query.trim();
    for (const p of products) {
      const v = p.variants.find((x) => x.barcode === code);
      if (v) {
        addVariant(p, v);
        setQuery('');
        return;
      }
    }
  }

  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const tax = outlet && outlet.taxRateBps > 0 && !taxInclusiveUnknown ? Math.round((subtotal * outlet.taxRateBps) / 10000) : 0;
  const total = subtotal + tax;

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  if (!outlets.length) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-semibold">No outlet yet</h1>
        <p className="mt-2 text-muted-foreground">
          Create your first store under <a href="/dashboard/outlets" className="text-primary underline">Outlets</a> to start selling.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-4 lg:h-[calc(100vh-1.5rem)] lg:flex-row">
      {/* Catalog */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Search or scan barcode…"
              className="w-full rounded-md border border-input bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={outletId}
            onChange={(e) => setOutletId(e.target.value)}
            className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) =>
            p.variants.map((v) => (
              <button
                key={v.id}
                onClick={() => addVariant(p, v)}
                className="flex flex-col rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent"
              >
                <span className="line-clamp-2 text-sm font-medium">{p.name}</span>
                {v.name !== 'Default' && <span className="text-xs text-muted-foreground">{v.name}</span>}
                <span className="mt-auto pt-2 text-sm font-semibold text-primary">{rupiah(v.price)}</span>
              </button>
            )),
          )}
          {!filtered.length && <p className="col-span-full p-8 text-center text-muted-foreground">No products match.</p>}
        </div>
      </div>

      {/* Cart */}
      <div className="flex w-full flex-col rounded-lg border border-border bg-card lg:w-96">
        <div className="border-b border-border p-4">
          <CustomerPicker customer={customer} onChange={setCustomer} />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {cart.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Cart is empty. Tap a product.</p>}
          {cart.map((l) => (
            <div key={l.variantId} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-accent">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <p className="text-xs text-muted-foreground">
                  {rupiah(l.unitPrice)}{l.variantName !== 'Default' ? ` · ${l.variantName}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setQty(l.variantId, l.qty - 1)} className="rounded p-1 hover:bg-background"><Minus className="h-4 w-4" /></button>
                <span className="w-6 text-center text-sm">{l.qty}</span>
                <button onClick={() => setQty(l.variantId, l.qty + 1)} className="rounded p-1 hover:bg-background"><Plus className="h-4 w-4" /></button>
              </div>
              <span className="w-20 text-right text-sm font-medium">{rupiah(l.unitPrice * l.qty)}</span>
              <button onClick={() => setQty(l.variantId, 0)} className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <div className="space-y-1 border-t border-border p-4 text-sm">
          <Row label="Subtotal" value={rupiah(subtotal)} />
          {tax > 0 && <Row label={`Tax (${(outlet!.taxRateBps / 100).toFixed(0)}%)`} value={rupiah(tax)} />}
          <div className="flex justify-between pt-1 text-base font-semibold">
            <span>Total</span>
            <span className="text-primary">{rupiah(total)}</span>
          </div>
          <button
            disabled={!cart.length}
            onClick={() => setPaying(true)}
            className="mt-3 w-full rounded-md bg-primary py-3 font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Charge {rupiah(total)}
          </button>
        </div>
      </div>

      {paying && (
        <PaymentModal
          total={total}
          onClose={() => setPaying(false)}
          onConfirm={async (payments) => {
            setError(null);
            try {
              const res = await api.post<{ sale: Sale }>('/sales', {
                outletId,
                customerId: customer?.id ?? null,
                items: cart.map((l) => ({ variantId: l.variantId, quantity: l.qty })),
                payments,
              });
              setReceipt(res.data.sale);
              setCart([]);
              setCustomer(null);
              setPaying(false);
            } catch (e) {
              setError(e instanceof ApiRequestError ? e.message : 'Sale failed');
            }
          }}
        />
      )}

      {receipt && <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />}
      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}

// Tax is computed server-side authoritatively; the preview here is best-effort.
const taxInclusiveUnknown = false;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function CustomerPicker({ customer, onChange }: { customer: Customer | null; onChange: (c: Customer | null) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || q.trim().length < 1) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api.get<{ items: Customer[] }>(`/customers?q=${encodeURIComponent(q.trim())}`);
        setResults((res.data as { items?: Customer[] }).items ?? []);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  if (customer) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{customer.name}</p>
          {customer.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
        </div>
        <button onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Attach customer (optional)"
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => { onChange(c); setQ(''); setOpen(false); }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
            >
              {c.name} {c.phone && <span className="text-muted-foreground">· {c.phone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentModal({ total, onClose, onConfirm }: { total: number; onClose: () => void; onConfirm: (p: unknown[]) => void }) {
  const [method, setMethod] = useState<'CASH' | 'QRIS' | 'CARD' | 'GIFT_CARD'>('CASH');
  const [tendered, setTendered] = useState<number>(total);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const change = Math.max(0, tendered - total);
  const quick = [total, 50000, 100000, 150000, 200000].filter((v, i, a) => a.indexOf(v) === i);

  async function confirm() {
    setBusy(true);
    const payment =
      method === 'CASH'
        ? { method, amount: total, tendered }
        : method === 'GIFT_CARD'
        ? { method, amount: total, reference: reference.trim(), status: 'PAID' }
        : { method, amount: total, reference: reference || undefined, status: 'PAID' };
    await onConfirm([payment]);
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Payment</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <p className="mt-1 text-2xl font-bold text-primary">{rupiah(total)}</p>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {(['CASH', 'QRIS', 'CARD', 'GIFT_CARD'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`rounded-md border py-2 text-xs font-medium ${method === m ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}
            >
              {m === 'CASH' ? 'Cash' : m === 'QRIS' ? 'QRIS' : m === 'CARD' ? 'Card' : 'Gift card'}
            </button>
          ))}
        </div>

        {method === 'CASH' && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {quick.map((v) => (
                <button key={v} onClick={() => setTendered(v)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
                  {rupiah(v)}
                </button>
              ))}
            </div>
            <label className="block text-sm">
              <span className="text-muted-foreground">Cash received</span>
              <input
                type="number"
                value={tendered}
                onChange={(e) => setTendered(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Change</span>
              <span className="font-semibold">{rupiah(change)}</span>
            </div>
          </div>
        )}

        {method !== 'CASH' && (
          <label className="mt-4 block text-sm">
            <span className="text-muted-foreground">
              {method === 'QRIS'
                ? 'QRIS reference (optional)'
                : method === 'GIFT_CARD'
                ? 'Gift-card code'
                : 'Card / EDC reference (optional)'}
            </span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={method === 'QRIS' ? 'Plugipay QRIS ref' : method === 'GIFT_CARD' ? 'GC-XXXXXXXXXX' : 'Approval code'}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
            />
            {method === 'GIFT_CARD' && (
              <span className="mt-1 block text-xs text-muted-foreground">
                The card balance must cover {rupiah(total)}. Insufficient balance cancels the sale.
              </span>
            )}
          </label>
        )}

        <button
          disabled={busy || (method === 'CASH' && tendered < total) || (method === 'GIFT_CARD' && !reference.trim())}
          onClick={confirm}
          className="mt-5 w-full rounded-md bg-primary py-3 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {busy ? 'Processing…' : 'Complete sale'}
        </button>
      </div>
    </div>
  );
}

function ReceiptModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 text-center" onClick={(e) => e.stopPropagation()}>
        <Receipt className="mx-auto h-10 w-10 text-primary" />
        <h2 className="mt-2 text-lg font-semibold">Sale complete</h2>
        <p className="text-sm text-muted-foreground">{sale.number}</p>
        <div className="my-4 space-y-1 border-y border-border py-3 text-left text-sm">
          {sale.items.map((it, i) => (
            <div key={i} className="flex justify-between">
              <span>{it.quantity}× {it.productName}</span>
              <span>{rupiah(it.lineTotal)}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span className="text-primary">{rupiah(sale.total)}</span>
        </div>
        {sale.changeTotal > 0 && (
          <div className="mt-1 flex justify-between text-sm text-muted-foreground">
            <span>Change</span>
            <span>{rupiah(sale.changeTotal)}</span>
          </div>
        )}
        <button onClick={onClose} className="mt-5 w-full rounded-md bg-primary py-2.5 font-semibold text-primary-foreground hover:opacity-90">
          New sale
        </button>
      </div>
    </div>
  );
}
