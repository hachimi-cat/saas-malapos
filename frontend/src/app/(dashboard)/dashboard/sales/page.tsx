'use client';

import { useEffect, useState } from 'react';
import { Receipt, X, Loader2, Ban, RotateCcw } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';

/*
 * Sales history — the merchant's ledger of every transaction. Filter by
 * outlet + status, page through with a cursor "Load more", and click a row
 * to open the full receipt (line items, tax, payments, change, cashier).
 * Completed sales can be voided with an optional reason. Real backend.
 */

type SaleStatus = 'COMPLETED' | 'VOIDED' | 'PARKED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';

type Outlet = { id: string; name: string };

type Payment = { method: string; amount: number; tendered?: number; change?: number; reference?: string | null };

type SaleRow = {
  id: string;
  number: string;
  total: number;
  status: SaleStatus;
  createdAt: string;
  cashierName: string | null;
  payments: Payment[];
  _count: { items: number };
};

type SaleItem = {
  id: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type SaleDetail = {
  id: string;
  number: string;
  status: SaleStatus;
  subtotal: number;
  taxTotal: number;
  total: number;
  changeTotal: number;
  refundedTotal: number;
  createdAt: string;
  cashierName: string | null;
  items: SaleItem[];
  payments: Payment[];
  outlet: { name: string };
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PARKED', label: 'Parked' },
  { value: 'VOIDED', label: 'Voided' },
  { value: 'PARTIALLY_REFUNDED', label: 'Partially refunded' },
  { value: 'REFUNDED', label: 'Refunded' },
];

function statusLabel(status: SaleStatus): string {
  if (status === 'PARTIALLY_REFUNDED') return 'Partially refunded';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function StatusBadge({ status }: { status: SaleStatus }) {
  const cls =
    status === 'COMPLETED'
      ? 'bg-primary/10 text-primary'
      : status === 'PARKED'
      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
      : status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED'
      ? 'bg-destructive/10 text-destructive'
      : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {statusLabel(status)}
    </span>
  );
}

function methodLabel(m: string): string {
  return m === 'QRIS' ? 'QRIS' : m.charAt(0) + m.slice(1).toLowerCase();
}

function paymentSummary(payments: Payment[]): string {
  if (!payments.length) return '—';
  return Array.from(new Set(payments.map((p) => methodLabel(p.method)))).join(', ');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function SalesPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load outlets once.
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ outlets: Outlet[] }>('/outlets');
        setOutlets(res.data.outlets);
      } catch {
        // Outlet filter is optional; surface load errors via the list fetch.
      }
    })();
  }, []);

  // (Re)load the list whenever a filter changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (outletId) qs.set('outletId', outletId);
        if (status) qs.set('status', status);
        const res = await api.get<SaleRow[]>(`/sales${qs.toString() ? `?${qs}` : ''}`);
        if (cancelled) return;
        setRows(res.data);
        setCursor(res.meta.cursor ?? null);
        setHasMore(Boolean(res.meta.hasMore));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load sales');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [outletId, status]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams();
      if (outletId) qs.set('outletId', outletId);
      if (status) qs.set('status', status);
      qs.set('cursor', cursor);
      const res = await api.get<SaleRow[]>(`/sales?${qs}`);
      setRows((r) => [...r, ...res.data]);
      setCursor(res.meta.cursor ?? null);
      setHasMore(Boolean(res.meta.hasMore));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }

  // After a void/refund, patch the row's status in place.
  function applyStatus(updated: { id: string; status: SaleStatus }) {
    setRows((r) => r.map((row) => (row.id === updated.id ? { ...row, status: updated.status } : row)));
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center gap-3">
        <Receipt className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Sales</h1>
          <p className="text-sm text-muted-foreground">Every transaction across your outlets. Click a row for the full receipt.</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <select
          value={outletId}
          onChange={(e) => setOutletId(e.target.value)}
          className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All outlets</option>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="p-10 text-center text-sm text-destructive">{error}</div>
        ) : !rows.length ? (
          <div className="p-10 text-center text-muted-foreground">No sales match these filters yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Receipt #</th>
                <th className="px-4 py-3 font-medium">Date / time</th>
                <th className="px-4 py-3 text-right font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-accent"
                >
                  <td className="px-4 py-3 font-medium">{row.number}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(row.createdAt)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{row._count.items}</td>
                  <td className="px-4 py-3 text-muted-foreground">{paymentSummary(row.payments)}</td>
                  <td className="px-4 py-3 text-right font-medium">{rupiah(row.total)}</td>
                  <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && !error && hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-5 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-40"
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {selectedId && (
        <ReceiptDetailModal
          saleId={selectedId}
          onClose={() => setSelectedId(null)}
          onStatusChange={applyStatus}
        />
      )}
    </div>
  );
}

function ReceiptDetailModal({
  saleId,
  onClose,
  onStatusChange,
}: {
  saleId: string;
  onClose: () => void;
  onStatusChange: (updated: { id: string; status: SaleStatus }) => void;
}) {
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [refunding, setRefunding] = useState(false);

  async function load() {
    try {
      const res = await api.get<{ sale: SaleDetail }>(`/sales/${saleId}`);
      setSale(res.data.sale);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load receipt');
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<{ sale: SaleDetail }>(`/sales/${saleId}`);
        if (!cancelled) setSale(res.data.sale);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiRequestError ? e.message : 'Failed to load receipt');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  async function voidSale() {
    setVoiding(true);
    setError(null);
    try {
      const res = await api.post<{ sale: SaleDetail }>(`/sales/${saleId}/void`, {
        reason: reason.trim() || undefined,
      });
      setSale(res.data.sale);
      onStatusChange({ id: res.data.sale.id, status: res.data.sale.status });
      setConfirming(false);
      setReason('');
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to void sale');
    } finally {
      setVoiding(false);
    }
  }

  const refundable = sale ? sale.total - sale.refundedTotal : 0;
  const canRefund =
    sale && (sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_REFUNDED') && refundable > 0;

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Receipt</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground">Loading…</div>
        ) : error && !sale ? (
          <div className="py-10 text-center text-sm text-destructive">{error}</div>
        ) : sale ? (
          <>
            <div className="mt-1 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{sale.number}</p>
                <p className="text-xs text-muted-foreground">{sale.outlet.name} · {formatDate(sale.createdAt)}</p>
              </div>
              <StatusBadge status={sale.status} />
            </div>

            <div className="my-4 space-y-1 border-y border-border py-3 text-sm">
              {sale.items.map((it, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="min-w-0">
                    {it.quantity}× {it.productName}
                    {it.variantName && it.variantName !== 'Default' ? (
                      <span className="text-muted-foreground"> · {it.variantName}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0">{rupiah(it.lineTotal)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="text-foreground">{rupiah(sale.subtotal)}</span>
              </div>
              {sale.taxTotal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span className="text-foreground">{rupiah(sale.taxTotal)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 text-base font-semibold">
                <span>Total</span>
                <span className="text-primary">{rupiah(sale.total)}</span>
              </div>
              {sale.refundedTotal > 0 && (
                <div className="flex justify-between text-destructive">
                  <span>Refunded</span>
                  <span>− {rupiah(sale.refundedTotal)}</span>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Payments</p>
              {sale.payments.map((p, i) => (
                <div key={i} className="flex justify-between text-muted-foreground">
                  <span>
                    {methodLabel(p.method)}
                    {p.reference ? <span className="text-xs"> · {p.reference}</span> : null}
                  </span>
                  <span className="text-foreground">{rupiah(p.amount)}</span>
                </div>
              ))}
              {sale.changeTotal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Change</span>
                  <span className="text-foreground">{rupiah(sale.changeTotal)}</span>
                </div>
              )}
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Cashier: {sale.cashierName ?? '—'}
            </p>

            {error && sale && (
              <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
            )}

            {canRefund && !confirming && (
              <div className="mt-5 border-t border-border pt-4">
                {!refunding ? (
                  <button
                    onClick={() => setRefunding(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
                  >
                    <RotateCcw className="h-4 w-4" /> Refund
                  </button>
                ) : (
                  <RefundPanel
                    items={sale.items}
                    refundable={refundable}
                    onCancel={() => setRefunding(false)}
                    onSubmit={async (payload) => {
                      setError(null);
                      try {
                        const res = await api.post<{ sale: SaleDetail }>(`/sales/${saleId}/refund`, payload);
                        setSale(res.data.sale);
                        onStatusChange({ id: res.data.sale.id, status: res.data.sale.status });
                        setRefunding(false);
                        await load();
                      } catch (e) {
                        setError(e instanceof ApiRequestError ? e.message : 'Failed to refund');
                      }
                    }}
                  />
                )}
              </div>
            )}

            {sale.status === 'COMPLETED' && !refunding && (
              <div className="mt-5 border-t border-border pt-4">
                {!confirming ? (
                  <button
                    onClick={() => setConfirming(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-destructive/40 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Ban className="h-4 w-4" /> Void sale
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Void this sale?</p>
                    <p className="text-xs text-muted-foreground">
                      This reverses the transaction and restocks the items. This can’t be undone.
                    </p>
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setConfirming(false); setReason(''); }}
                        disabled={voiding}
                        className="flex-1 rounded-md border border-border py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-40"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={voidSale}
                        disabled={voiding}
                        className="flex-1 rounded-md bg-destructive py-2 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        {voiding ? 'Voiding…' : 'Confirm void'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

type RefundPayload = {
  lines?: { transactionItemId: string; qty: number }[];
  amount?: number;
  restock?: boolean;
  reason?: string;
};

function RefundPanel({
  items,
  refundable,
  onCancel,
  onSubmit,
}: {
  items: SaleItem[];
  refundable: number;
  onCancel: () => void;
  onSubmit: (payload: RefundPayload) => Promise<void>;
}) {
  const [mode, setMode] = useState<'lines' | 'amount'>('lines');
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [amount, setAmount] = useState<number>(0);
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const lineEstimate = items.reduce((s, it) => {
    const q = qtyById[it.id] ?? 0;
    if (q <= 0) return s;
    const perUnit = Math.round(it.lineTotal / it.quantity);
    return s + (q === it.quantity ? it.lineTotal : perUnit * q);
  }, 0);

  const valid = mode === 'lines' ? lineEstimate > 0 && lineEstimate <= refundable : amount > 0 && amount <= refundable;

  async function submit() {
    setBusy(true);
    const payload: RefundPayload =
      mode === 'lines'
        ? {
            lines: items
              .map((it) => ({ transactionItemId: it.id, qty: qtyById[it.id] ?? 0 }))
              .filter((l) => l.qty > 0),
            restock,
            reason: reason.trim() || undefined,
          }
        : { amount, reason: reason.trim() || undefined };
    await onSubmit(payload);
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Refund</p>
      <p className="text-xs text-muted-foreground">Refundable balance: {rupiah(refundable)}</p>

      <div className="grid grid-cols-2 gap-2">
        {(['lines', 'amount'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md border py-1.5 text-sm font-medium ${mode === m ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}
          >
            {m === 'lines' ? 'Select items' : 'Amount'}
          </button>
        ))}
      </div>

      {mode === 'lines' ? (
        <div className="space-y-2">
          {items.map((it) => {
            const q = qtyById[it.id] ?? 0;
            return (
              <div key={it.id} className="flex items-center gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{it.productName}</p>
                  <p className="text-xs text-muted-foreground">{it.quantity} sold · {rupiah(it.lineTotal)}</p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={it.quantity}
                  value={q}
                  onChange={(e) =>
                    setQtyById((m) => ({ ...m, [it.id]: Math.max(0, Math.min(it.quantity, Number(e.target.value))) }))
                  }
                  className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            );
          })}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
            <span>Return items to stock</span>
          </label>
          <p className="text-sm font-medium">Refund {rupiah(lineEstimate)}</p>
        </div>
      ) : (
        <label className="block text-sm">
          <span className="text-muted-foreground">Amount to refund</span>
          <input
            type="number"
            min={0}
            max={refundable}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Math.min(refundable, Number(e.target.value))))}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      )}

      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex-1 rounded-md border border-border py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy || !valid}
          className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? 'Refunding…' : 'Confirm refund'}
        </button>
      </div>
    </div>
  );
}
