'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Truck, Printer, X, RotateCcw, CheckCircle2, ExternalLink, Plus, Trash2, UserSearch } from 'lucide-react';
import { shipmentsApi, shippingApi, type Shipment, type Rate, type ShippingOrigin } from '@/lib/fulfillment-api';
import { api, ApiRequestError } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';
import { FulfillmentModuleOff } from '@/components/fulfillment/module-off';

/*
 * Fulfillment → Shipments. malapos port of storlaunch's fulfillment/
 * shipments page over the /api/v1/fulfillment/shipments proxy. Physical
 * orders via Fulkruma → Biteship: list / detail / book courier / print
 * label / cancel. The create-from-sale flow stays on /dashboard/
 * fulfillment (the POS delivery surface). Built against the real backend.
 */

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

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass(status)}`}>
      {prettyStatus(status)}
    </span>
  );
}

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Shipment | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function reload() {
    setLoading(true);
    setError('');
    setModuleOff(false);
    try {
      const res = await shipmentsApi.list();
      setShipments(res.data ?? []);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) setModuleOff(true);
      else setError(e instanceof ApiRequestError ? e.message : 'Failed to load shipments');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleCancel(s: Shipment) {
    const reason = prompt('Cancel reason?');
    if (!reason) return;
    try {
      await shipmentsApi.cancel(s.id, reason);
      await reload();
      if (detail?.id === s.id) setDetail(null);
    } catch (e) {
      alert(e instanceof ApiRequestError ? e.message : 'Failed to cancel shipment');
    }
  }

  async function handlePrintLabel(s: Shipment) {
    try {
      const res = await shipmentsApi.getLabel(s.id);
      if (res.data?.url) window.open(res.data.url, '_blank');
    } catch (e) {
      alert(e instanceof ApiRequestError ? e.message : 'Label not ready yet — courier may still be processing the pickup.');
    }
  }

  async function handleConfirmPickup(s: Shipment) {
    if (!confirm(`Book courier now? ${s.courierCode.toUpperCase()} will be dispatched to pick up the parcel.`)) return;
    try {
      await shipmentsApi.confirmPickup(s.id);
      await reload();
    } catch (e) {
      alert(e instanceof ApiRequestError ? e.message : 'Failed to book courier');
    }
  }

  async function openDetail(s: Shipment) {
    try {
      const res = await shipmentsApi.get(s.id);
      setDetail(res.data ?? s);
    } catch {
      setDetail(s);
    }
  }

  const columns: Column<Shipment>[] = [
    {
      key: 'createdAt',
      header: 'Date',
      sortable: true,
      sortValue: (r) => new Date(r.createdAt).getTime(),
      searchValue: (r) => `${r.customerEmail ?? ''} ${r.waybillId ?? ''} ${r.courierCode}`,
      cell: (r) => <span className="text-muted-foreground">{formatDate(r.createdAt)}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      sortValue: (r) => r.customerEmail ?? '',
      cell: (r) => r.customerEmail ?? '—',
    },
    {
      key: 'courier',
      header: 'Courier',
      sortable: true,
      sortValue: (r) => r.courierCode,
      cell: (r) => (
        <>
          <span className="font-medium uppercase">{r.courierCode}</span>
          <span className="ml-1 text-xs text-muted-foreground">{r.courierServiceCode}</span>
        </>
      ),
    },
    {
      key: 'awb',
      header: 'AWB',
      sortable: true,
      sortValue: (r) => r.waybillId ?? '',
      cell: (r) => <span className="font-mono">{r.waybillId ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (r) => r.status,
      cell: (r) => <StatusPill status={r.status} />,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.price,
      cell: (r) => formatCurrency(r.price),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          {r.status === 'pending' && (
            <button
              type="button"
              onClick={() => handleConfirmPickup(r)}
              title="Book courier (parcel is ready)"
              className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Book courier
            </button>
          )}
          <button type="button" onClick={() => openDetail(r)} title="View detail" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => handlePrintLabel(r)} title="Print label" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Printer className="h-3.5 w-3.5" />
          </button>
          {['pending', 'confirmed', 'allocated', 'picking_up'].includes(r.status) && (
            <button type="button" onClick={() => handleCancel(r)} title="Cancel" className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const filters: FilterDef<Shipment>[] = [
    { key: 'status', label: 'Status', accessor: (r) => r.status },
    { key: 'courier', label: 'Courier', accessor: (r) => r.courierCode },
  ];

  if (moduleOff) return <FulfillmentModuleOff blurb="Shipments dispatch couriers via Fulkruma (Biteship). Turn on the Fulfillment module to ship physical orders." />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Shipments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Physical orders via Fulkruma → Biteship.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            className="flex items-center gap-2 rounded border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> New shipment
          </button>
        </div>
      </header>

      {error && <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : shipments.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Truck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No shipments yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Dispatch a sale for delivery from the{' '}
            <a href="/dashboard/fulfillment" className="text-primary hover:underline">Fulfillment</a> page.
          </p>
        </div>
      ) : (
        <DataTable
          rows={shipments}
          columns={columns}
          filters={filters}
          rowKey={(r) => r.id}
          searchPlaceholder="Search customer, AWB, courier…"
          defaultSort={{ key: 'createdAt', dir: 'desc' }}
          empty="No shipments match."
        />
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Shipment {detail.id.slice(-8)}</h2>
                <p className="text-xs text-muted-foreground">Biteship order {detail.biteshipOrderId}</p>
              </div>
              <button onClick={() => setDetail(null)} className="rounded p-1 text-muted-foreground hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-medium uppercase text-muted-foreground">Status</div>
                  <div className="mt-1"><StatusPill status={detail.status} /></div>
                </div>
                <Field label="Courier" value={`${detail.courierCode.toUpperCase()} / ${detail.courierServiceCode}`} />
                <Field label="AWB" value={detail.waybillId ?? '—'} mono />
                <Field label="Price" value={formatCurrency(detail.price)} />
                <Field label="Insured" value={detail.insured ? `Yes (${formatCurrency(detail.insurance)})` : 'No'} />
                <Field label="Customer" value={detail.customerEmail ?? '—'} />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">Destination</div>
                <div className="rounded border border-border bg-muted/30 p-3 text-xs">
                  <pre className="whitespace-pre-wrap font-sans">{JSON.stringify(detail.destinationSnapshot, null, 2)}</pre>
                </div>
              </div>
              {detail.trackingUrl && (
                <a href={detail.trackingUrl} target="_blank" rel="noreferrer" className="block text-center text-sm text-primary hover:underline">
                  Open Biteship tracking →
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <CreateShipmentModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}

// ── New shipment (create draft) ──────────────────────────────────────
type Recipient = {
  name: string;
  phone: string;
  email: string;
  address: string;
  area: string;
  postalCode: string;
};

type ItemRow = { name: string; qty: string; weight: string; value: string };

type CustomerLite = { id: string; name: string; phone: string | null; email: string | null };

function emptyItem(): ItemRow {
  return { name: '', qty: '1', weight: '500', value: '0' };
}

function CreateShipmentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [recipient, setRecipient] = useState<Recipient>({
    name: '',
    phone: '',
    email: '',
    address: '',
    area: '',
    postalCode: '',
  });
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [picked, setPicked] = useState<Rate | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [originLoading, setOriginLoading] = useState(true);
  const [originMissing, setOriginMissing] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    // Origin must be configured or Fulkruma can't quote/create. Mirror the
    // settings page's "has origin" check (address or contactName present).
    shippingApi
      .getOrigin()
      .then((res) => {
        const o = (res.data ?? {}) as ShippingOrigin;
        const has = Boolean(o.address || o.areaId || o.postal || o.contactName);
        setOriginMissing(!has);
      })
      .catch(() => setOriginMissing(false)) // don't block on a transient origin error
      .finally(() => setOriginLoading(false));
  }, []);

  const totalWeight = items.reduce(
    (sum, it) => sum + (Number(it.weight) || 0) * (Number(it.qty) || 0),
    0,
  );

  function updateItem(i: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
    setRates([]);
    setPicked(null);
  }

  function destinationPayload(): Record<string, unknown> {
    return {
      contactName: recipient.name,
      contactPhone: recipient.phone,
      contactEmail: recipient.email || undefined,
      address: [recipient.address, recipient.area].filter(Boolean).join(', '),
      area: recipient.area,
      postalCode: recipient.postalCode,
    };
  }

  function itemsPayload(): Array<Record<string, unknown>> {
    return items.map((it) => ({
      name: it.name || 'Item',
      quantity: Number(it.qty) || 1,
      weight: Number(it.weight) || 0,
      value: Number(it.value) || 0,
    }));
  }

  function validRecipient(): string | null {
    if (!recipient.name.trim()) return 'Recipient name is required.';
    if (!recipient.phone.trim()) return 'Recipient phone is required.';
    if (!recipient.address.trim()) return 'Recipient address is required.';
    if (!recipient.postalCode.trim()) return 'Recipient postal code is required.';
    if (items.length === 0) return 'Add at least one item.';
    return null;
  }

  async function getRates() {
    const v = validRecipient();
    if (v) {
      setError(v);
      return;
    }
    setLoadingRates(true);
    setError(null);
    setRates([]);
    setPicked(null);
    try {
      const { data } = await shippingApi.rates({
        destination: destinationPayload(),
        items: itemsPayload(),
      });
      // Fulkruma returns either an array of rates or an object wrapping
      // `pricing` — accept both shapes (mirrors the sell-flow delivery modal).
      const list = Array.isArray(data) ? data : ((data?.pricing as Rate[]) ?? []);
      setRates(list);
      if (list.length === 0) setError('No courier rates available for this destination.');
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to fetch rates');
    } finally {
      setLoadingRates(false);
    }
  }

  async function create() {
    if (!picked) {
      setError('Pick a courier rate first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = picked as Rate & { courierType?: string; serviceType?: string };
      await shipmentsApi.create({
        destination: destinationPayload(),
        items: itemsPayload(),
        courierCode: picked.courierCode,
        courierServiceCode: picked.courierServiceCode,
        courierType: r.courierType ?? r.serviceType ?? undefined,
        price: picked.price,
        customerId: customerId ?? undefined,
        customerEmail: recipient.email || undefined,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to create shipment');
    } finally {
      setSubmitting(false);
    }
  }

  function applyCustomer(c: CustomerLite) {
    setCustomerId(c.id);
    setRecipient((prev) => ({
      ...prev,
      name: c.name ?? prev.name,
      phone: c.phone ?? prev.phone,
      email: c.email ?? prev.email,
    }));
    setPickerOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-semibold">New shipment</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-4">
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Creating books a no-charge draft — use <span className="font-medium">Book courier</span> to confirm
            pickup &amp; dispatch.
          </p>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {originLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : originMissing ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm">
              <p className="font-medium">No pickup origin set</p>
              <p className="mt-1 text-muted-foreground">
                Set your shipping origin before quoting couriers — Fulkruma needs it to calculate rates.
              </p>
              <Link
                href="/dashboard/fulfillment/settings"
                className="mt-2 inline-flex items-center gap-1 text-primary hover:underline"
              >
                Go to Fulfillment settings <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <>
              {/* Recipient */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">Recipient</h3>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                  >
                    <UserSearch className="h-3.5 w-3.5" /> Pick customer
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Name" value={recipient.name} onChange={(v) => setRecipient({ ...recipient, name: v })} />
                  <FormField label="Phone" value={recipient.phone} onChange={(v) => setRecipient({ ...recipient, phone: v })} />
                </div>
                <FormField label="Email (optional)" value={recipient.email} onChange={(v) => setRecipient({ ...recipient, email: v })} />
                <FormField label="Address line" value={recipient.address} onChange={(v) => { setRecipient({ ...recipient, address: v }); setRates([]); setPicked(null); }} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Area / City" value={recipient.area} onChange={(v) => { setRecipient({ ...recipient, area: v }); setRates([]); setPicked(null); }} />
                  <FormField label="Postal code" value={recipient.postalCode} onChange={(v) => { setRecipient({ ...recipient, postalCode: v }); setRates([]); setPicked(null); }} />
                </div>
              </section>

              {/* Items */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">Parcel items</h3>
                  <span className="text-xs text-muted-foreground">Total weight: {totalWeight} g</span>
                </div>
                <div className="space-y-2">
                  {items.map((it, i) => (
                    <div key={i} className="grid grid-cols-[1fr_3rem_4rem_4.5rem_auto] items-end gap-2">
                      <MiniField label="Name" value={it.name} onChange={(v) => updateItem(i, { name: v })} />
                      <MiniField label="Qty" value={it.qty} onChange={(v) => updateItem(i, { qty: v })} type="number" />
                      <MiniField label="Wt (g)" value={it.weight} onChange={(v) => updateItem(i, { weight: v })} type="number" />
                      <MiniField label="Value" value={it.value} onChange={(v) => updateItem(i, { value: v })} type="number" />
                      <button
                        type="button"
                        disabled={items.length === 1}
                        onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                        className="mb-1.5 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                        title="Remove item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setItems((prev) => [...prev, emptyItem()])}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add item
                </button>
              </section>

              {/* Rates */}
              <section className="space-y-2">
                <button
                  type="button"
                  disabled={loadingRates}
                  onClick={() => void getRates()}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                >
                  {loadingRates ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                  Get rates
                </button>
                {rates.length > 0 && (
                  <div className="space-y-2">
                    {rates.map((r, i) => {
                      const isPicked =
                        picked?.courierCode === r.courierCode &&
                        picked?.courierServiceCode === r.courierServiceCode;
                      return (
                        <button
                          key={`${r.courierCode}-${r.courierServiceCode}-${i}`}
                          type="button"
                          onClick={() => setPicked(r)}
                          className={
                            'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ' +
                            (isPicked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted')
                          }
                        >
                          <div>
                            <div className="font-medium">
                              {(r.courierName ?? r.courierCode).toUpperCase()} · {r.serviceName ?? r.courierServiceCode}
                            </div>
                            {r.duration && <div className="text-xs text-muted-foreground">{r.duration}</div>}
                          </div>
                          <span className="font-medium">{formatCurrency(r.price)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            type="button"
            disabled={originMissing || originLoading || !picked || submitting}
            onClick={() => void create()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create draft
          </button>
        </div>

        {pickerOpen && <CustomerPicker onPick={applyCustomer} onClose={() => setPickerOpen(false)} />}
      </div>
    </div>
  );
}

function CustomerPicker({
  onPick,
  onClose,
}: {
  onPick: (c: CustomerLite) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      const q = query.trim();
      api
        .get<{ items: CustomerLite[] }>(`/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`)
        .then((res) => setCustomers(res.data.items ?? []))
        .catch(() => setCustomers([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 pt-16" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Pick customer</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone or email…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="mt-2 max-h-64 overflow-y-auto">
            {loading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : customers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No customers found.</p>
            ) : (
              <ul className="divide-y divide-border">
                {customers.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onPick(c)}
                      className="w-full px-2 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{c.phone ?? c.email ?? ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
    </label>
  );
}

function MiniField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
      />
    </label>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="mb-0.5 text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</div>
    </div>
  );
}
