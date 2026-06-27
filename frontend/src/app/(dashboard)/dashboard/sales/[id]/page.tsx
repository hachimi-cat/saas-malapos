'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Ban,
  RotateCcw,
  Printer,
  Loader2,
  User,
  Truck,
  MapPin,
  Phone,
  Hash,
  CheckCircle2,
  ExternalLink,
  X,
  Store,
  Utensils,
} from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';
import { useModules } from '@/hooks/use-modules';
import { deliveryApi, shipmentsApi, type Shipment } from '@/lib/fulfillment-api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

/*
 * Sale detail — the full receipt for one POS transaction, on its own route
 * (replaces the old sales-list modal). Modeled on storlaunch's order-detail
 * page (orders/[id]): a big total + status header, customer block, line
 * items, payment/totals, void/refund affordances, and — only when the
 * Fulfillment module is on and the sale is a delivery — a shipment-detail
 * section that mirrors storlaunch's BiteshipTrackingPanel (adapted to the
 * Fulkruma delivery proxy malapos exposes). Real backend: GET /sales/:id.
 */

type SaleStatus = 'COMPLETED' | 'VOIDED' | 'PARKED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

type Modifier = { name: string; price: number };

type Payment = {
  method: string;
  amount: number;
  tendered?: number | null;
  change?: number | null;
  reference?: string | null;
};

type SaleItem = {
  id: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  modifiers: Modifier[];
  note: string | null;
  lineTotal: number;
};

type SaleDetail = {
  id: string;
  number: string;
  status: SaleStatus;
  orderType: OrderType;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  deliveryFee: number;
  total: number;
  paidTotal: number;
  changeTotal: number;
  refundedTotal: number;
  createdAt: string;
  cashierName: string | null;
  note: string | null;
  voidReason: string | null;
  fulkrumaShipmentId: string | null;
  deliveryStatus: string | null;
  outlet: { name: string };
  table: { label: string } | null;
  customer: { name: string; phone: string | null; email: string | null; loyaltyPoints: number } | null;
  items: SaleItem[];
  payments: Payment[];
};

const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  DINE_IN: 'Dine-in',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
};

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
    <Badge variant="outline" className={`rounded-full border-transparent ${cls}`}>
      {statusLabel(status)}
    </Badge>
  );
}

function methodLabel(m: string): string {
  return m === 'QRIS' ? 'QRIS' : m.charAt(0) + m.slice(1).toLowerCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

const dangerOutline = 'border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive';

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { modules } = useModules();

  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [voiding, setVoiding] = useState(false);
  const [confirmingVoid, setConfirmingVoid] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [refunding, setRefunding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ sale: SaleDetail }>(`/sales/${id}`);
      setSale(res.data.sale);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load receipt');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function voidSale() {
    setVoiding(true);
    setError(null);
    try {
      const res = await api.post<{ sale: SaleDetail }>(`/sales/${id}/void`, {
        reason: voidReason.trim() || undefined,
      });
      setSale((s) => (s ? { ...s, ...res.data.sale } : res.data.sale));
      setConfirmingVoid(false);
      setVoidReason('');
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to void sale');
    } finally {
      setVoiding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!sale) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/sales" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Sales
        </Link>
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? 'Sale not found'}
        </div>
      </div>
    );
  }

  const refundable = sale.total - sale.refundedTotal;
  const canRefund =
    (sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_REFUNDED') && refundable > 0;
  const isDelivery = sale.orderType === 'DELIVERY' || Boolean(sale.fulkrumaShipmentId);
  const showShipment = Boolean(modules.fulfillment) && isDelivery;

  return (
    <div className="space-y-6">
      <nav className="text-xs text-muted-foreground print:hidden">
        <Link href="/dashboard/sales" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Sales
        </Link>
        <span className="mx-1.5 text-muted-foreground/50">/</span>
        <span className="font-mono text-foreground">{sale.number}</span>
      </nav>

      {/* Header: total + status + meta + actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tabular-nums tracking-tight">{rupiah(sale.total)}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={sale.status} />
            <span className="text-xs text-muted-foreground">{formatDate(sale.createdAt)}</span>
            <Badge variant="secondary" className="gap-1 rounded-full font-normal text-muted-foreground">
              {sale.orderType === 'DELIVERY' ? <Truck className="h-3 w-3" /> : sale.orderType === 'DINE_IN' ? <Utensils className="h-3 w-3" /> : <Store className="h-3 w-3" />}
              {ORDER_TYPE_LABEL[sale.orderType]}
            </Badge>
            {sale.table && (
              <Badge variant="secondary" className="rounded-full font-normal text-muted-foreground">
                {sale.table.label}
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {sale.outlet.name} · Cashier {sale.cashierName ?? '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print receipt
          </Button>
          {canRefund && !refunding && (
            <Button type="button" variant="outline" onClick={() => setRefunding(true)}>
              <RotateCcw className="h-4 w-4" /> Refund
            </Button>
          )}
          {sale.status === 'COMPLETED' && !confirmingVoid && (
            <Button type="button" variant="outline" onClick={() => setConfirmingVoid(true)} className={dangerOutline}>
              <Ban className="h-4 w-4" /> Void sale
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive print:hidden">
          {error}
        </div>
      )}

      {sale.voidReason && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Void reason: {sale.voidReason}
        </div>
      )}

      {/* Void confirmation */}
      {confirmingVoid && (
        <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 print:hidden">
          <p className="text-sm font-medium">Void this sale?</p>
          <p className="text-xs text-muted-foreground">
            This reverses the transaction and restocks the items. This can&apos;t be undone.
          </p>
          <Input
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Reason (optional)"
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => { setConfirmingVoid(false); setVoidReason(''); }}
              disabled={voiding}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={voidSale} disabled={voiding}>
              {voiding && <Loader2 className="h-4 w-4 animate-spin" />}
              {voiding ? 'Voiding…' : 'Confirm void'}
            </Button>
          </div>
        </div>
      )}

      {/* Refund panel */}
      {refunding && sale && (
        <RefundPanel
          items={sale.items}
          refundable={refundable}
          onCancel={() => setRefunding(false)}
          onSubmit={async (payload) => {
            setError(null);
            try {
              const res = await api.post<{ sale: SaleDetail }>(`/sales/${id}/refund`, payload);
              setSale((s) => (s ? { ...s, ...res.data.sale } : res.data.sale));
              setRefunding(false);
              await load();
            } catch (e) {
              setError(e instanceof ApiRequestError ? e.message : 'Failed to refund');
            }
          }}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        {/* Line items + totals */}
        <div className="space-y-5">
          <Card className="p-6">
            <h2 className="mb-4 text-base font-semibold font-display">Items</h2>
            <table className="w-full text-sm">
              <tbody>
                {sale.items.map((it) => (
                  <tr key={it.id} className="border-b border-dashed border-border last:border-0">
                    <td className="py-2 pr-2">
                      <div>
                        {it.productName} <span className="text-muted-foreground">× {it.quantity}</span>
                        {it.variantName && it.variantName !== 'Default' && (
                          <span className="text-muted-foreground"> · {it.variantName}</span>
                        )}
                      </div>
                      {it.modifiers.length > 0 && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {it.modifiers.map((m) => m.name + (m.price ? ` (+${rupiah(m.price)})` : '')).join(' · ')}
                        </p>
                      )}
                      {it.note && it.note.trim() && (
                        <p className="mt-0.5 break-words text-xs text-muted-foreground">Note: {it.note.trim()}</p>
                      )}
                    </td>
                    <td className="py-2 text-right align-top font-medium tabular-nums">{rupiah(it.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
              <Row label="Subtotal" value={rupiah(sale.subtotal)} />
              {sale.discountTotal > 0 && <Row label="Discount" value={`− ${rupiah(sale.discountTotal)}`} muted />}
              {sale.taxTotal > 0 && <Row label="Tax" value={rupiah(sale.taxTotal)} />}
              {sale.deliveryFee > 0 && <Row label="Delivery fee" value={rupiah(sale.deliveryFee)} />}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-foreground pt-3">
              <span className="text-base font-semibold">Total</span>
              <span className="font-mono text-base font-semibold tabular-nums text-primary">{rupiah(sale.total)}</span>
            </div>
            {sale.refundedTotal > 0 && (
              <div className="mt-1 flex items-center justify-between text-sm text-destructive">
                <span>Refunded</span>
                <span className="tabular-nums">− {rupiah(sale.refundedTotal)}</span>
              </div>
            )}
          </Card>

          {/* Payments */}
          <Card className="p-6">
            <h2 className="mb-3 text-base font-semibold font-display">Payments</h2>
            <div className="space-y-2 text-sm">
              {sale.payments.length === 0 ? (
                <p className="text-muted-foreground">No payments recorded.</p>
              ) : (
                sale.payments.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {methodLabel(p.method)}
                      {p.reference ? <span className="text-xs"> · {p.reference}</span> : null}
                    </span>
                    <span className="font-mono tabular-nums">{rupiah(p.amount)}</span>
                  </div>
                ))
              )}
              <div className="space-y-1 border-t border-border pt-2">
                <Row label="Paid" value={rupiah(sale.paidTotal)} muted />
                {sale.changeTotal > 0 && <Row label="Change" value={rupiah(sale.changeTotal)} muted />}
              </div>
            </div>
          </Card>
        </div>

        {/* Right column: customer + shipment */}
        <div className="space-y-4">
          {sale.customer && (
            <Card className="p-6">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold font-display">
                <User className="h-4 w-4 text-muted-foreground" /> Customer
              </h2>
              <p className="text-sm">{sale.customer.name}</p>
              {sale.customer.phone && <p className="text-xs text-muted-foreground">{sale.customer.phone}</p>}
              {sale.customer.email && <p className="text-xs text-muted-foreground">{sale.customer.email}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                Loyalty: <span className="font-medium text-foreground">{sale.customer.loyaltyPoints.toLocaleString('id-ID')}</span> pts
              </p>
            </Card>
          )}

          {sale.note && (
            <Card className="p-6">
              <h2 className="mb-2 text-base font-semibold font-display">Order note</h2>
              <p className="text-sm text-muted-foreground">{sale.note}</p>
            </Card>
          )}

          {showShipment && (
            <ShipmentSection
              shipmentId={sale.fulkrumaShipmentId}
              deliveryStatus={sale.deliveryStatus}
              onChanged={load}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? 'text-muted-foreground' : ''}`}>
      <span className={muted ? '' : 'text-muted-foreground'}>{label}</span>
      <span className={`font-mono tabular-nums ${muted ? '' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}

// ── Shipment section ─────────────────────────────────────────────────
// Mirrors storlaunch's order-detail Shipping panel + BiteshipTrackingPanel,
// adapted to malapos's Fulkruma delivery proxy (routes/delivery.ts). Unlike
// storlaunch, the proxy exposes no tracking-history endpoint, so this shows
// the shipment status, courier/AWB facts, destination, and the manual
// fulfillment actions that fit a POS delivery (book courier / confirm
// pickup, view label, track) rather than a per-event driver timeline.
function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === 'delivered') return 'bg-green-500/10 text-green-400';
  if (s === 'cancelled' || s === 'returned' || s === 'failed') return 'bg-destructive/10 text-destructive';
  if (s === 'pending' || s === 'confirmed' || s === 'allocated') return 'bg-muted text-muted-foreground';
  return 'bg-primary/10 text-primary';
}

function prettyStatus(status: string): string {
  return status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function ShipmentSection({
  shipmentId,
  deliveryStatus,
  onChanged,
}: {
  shipmentId: string | null;
  deliveryStatus: string | null;
  onChanged: () => Promise<void>;
}) {
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(Boolean(shipmentId));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!shipmentId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await deliveryApi.getShipment(shipmentId);
      setShipment(res.data);
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Failed to load shipment');
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function confirmPickup() {
    if (!shipmentId) return;
    if (!confirm('Book courier now? The courier will be dispatched to pick up the parcel.')) return;
    setBusy(true);
    try {
      await deliveryApi.confirmPickup(shipmentId);
      await reload();
      await onChanged();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Failed to book courier');
    } finally {
      setBusy(false);
    }
  }

  async function cancelShipment() {
    if (!shipmentId) return;
    const reason = prompt('Cancel reason?');
    if (!reason) return;
    setBusy(true);
    try {
      await deliveryApi.cancelShipment(shipmentId, reason);
      await reload();
      await onChanged();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Failed to cancel shipment');
    } finally {
      setBusy(false);
    }
  }

  async function viewLabel() {
    if (!shipmentId) return;
    try {
      const res = await shipmentsApi.getLabel(shipmentId);
      if (res.data?.url) window.open(res.data.url, '_blank');
      else alert('Label not ready yet — the courier may still be processing the pickup.');
    } catch (e) {
      alert(e instanceof ApiRequestError ? e.message : 'Label not ready yet.');
    }
  }

  // No shipment dispatched yet for a delivery sale.
  if (!shipmentId) {
    return (
      <Card className="p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold font-display">
          <Truck className="h-4 w-4 text-muted-foreground" /> Delivery
        </h2>
        <p className="text-sm text-muted-foreground">
          This is a delivery order, but no courier has been dispatched yet. Create a shipment from the{' '}
          <Link href="/dashboard/fulfillment/shipments" className="text-primary hover:underline">Shipments</Link> page.
        </p>
      </Card>
    );
  }

  const status = shipment?.status ?? deliveryStatus ?? 'pending';
  const dest = (shipment?.destinationSnapshot ?? {}) as Record<string, unknown>;
  const recipientName = (dest.contactName as string | undefined) ?? null;
  const recipientPhone = (dest.contactPhone as string | undefined) ?? null;
  const recipientAddress = (dest.address as string | undefined) ?? null;

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold font-display">
          <Truck className="h-4 w-4 text-muted-foreground" /> Shipment
        </h2>
        <Badge variant="outline" className={`rounded-full border-transparent text-[10px] ${statusClass(status)}`}>
          {prettyStatus(status)}
        </Badge>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading shipment…
        </div>
      ) : err ? (
        <p className="text-sm text-destructive">{err}</p>
      ) : shipment ? (
        <div className="space-y-4">
          {(recipientName || recipientPhone || recipientAddress) && (
            <div className="space-y-1.5 text-sm">
              {recipientName && (
                <Fact icon={User} label="Recipient">{recipientName}</Fact>
              )}
              {recipientPhone && (
                <Fact icon={Phone} label="Phone"><a href={`tel:${recipientPhone}`} className="hover:underline">{recipientPhone}</a></Fact>
              )}
              {recipientAddress && (
                <Fact icon={MapPin} label="Destination"><span className="text-foreground/85">{recipientAddress}</span></Fact>
              )}
            </div>
          )}

          <div className="space-y-1.5 border-t border-border pt-4 text-sm">
            <Fact icon={Truck} label="Courier">
              <span className="font-medium uppercase">{shipment.courierCode}</span>
              <span className="ml-1 text-xs text-muted-foreground">{shipment.courierServiceCode}</span>
            </Fact>
            <Fact icon={Hash} label="Nomor resi">
              <span className="font-mono text-[13px]">{shipment.waybillId ?? '—'}</span>
            </Fact>
            {shipment.price > 0 && (
              <Fact icon={Truck} label="Shipping cost">{rupiah(shipment.price)}</Fact>
            )}
          </div>

          {shipment.trackingUrl && (
            <a
              href={shipment.trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Track on Biteship <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {/* Manual fulfillment actions for a POS delivery. */}
          <div className="flex flex-wrap gap-2 border-t border-border pt-4 print:hidden">
            {shipment.status === 'pending' && (
              <Button type="button" onClick={confirmPickup} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Book courier
              </Button>
            )}
            <Button type="button" variant="outline" onClick={viewLabel}>
              <Printer className="h-4 w-4" /> View label
            </Button>
            {['pending', 'confirmed', 'allocated', 'picking_up'].includes(shipment.status) && (
              <Button type="button" variant="outline" onClick={cancelShipment} disabled={busy} className={dangerOutline}>
                <X className="h-4 w-4" /> Cancel
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function Fact({ icon: Icon, label, children }: { icon: typeof Hash; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}

// ── Refund panel (ported verbatim from the old sales-list modal) ──────
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
    <Card className="space-y-3 p-5 print:hidden">
      <p className="text-sm font-medium">Refund</p>
      <p className="text-xs text-muted-foreground">Refundable balance: {rupiah(refundable)}</p>

      <Tabs value={mode} onValueChange={(v) => setMode(v as 'lines' | 'amount')}>
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="lines">Select items</TabsTrigger>
          <TabsTrigger value="amount">Amount</TabsTrigger>
        </TabsList>
      </Tabs>

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
                <Input
                  type="number"
                  min={0}
                  max={it.quantity}
                  value={q}
                  onChange={(e) =>
                    setQtyById((m) => ({ ...m, [it.id]: Math.max(0, Math.min(it.quantity, Number(e.target.value))) }))
                  }
                  className="w-16 text-right"
                />
              </div>
            );
          })}
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox checked={restock} onCheckedChange={(c) => setRestock(c === true)} />
            <span>Return items to stock</span>
          </Label>
          <p className="text-sm font-medium">Refund {rupiah(lineEstimate)}</p>
        </div>
      ) : (
        <div className="block max-w-xs space-y-1.5 text-sm">
          <Label>Amount to refund</Label>
          <Input
            type="number"
            min={0}
            max={refundable}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Math.min(refundable, Number(e.target.value))))}
          />
        </div>
      )}

      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="max-w-md"
      />

      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy || !valid}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? 'Refunding…' : 'Confirm refund'}
        </Button>
      </div>
    </Card>
  );
}
