'use client';

import { useEffect, useState } from 'react';
import { Loader2, Truck, Printer, X, RotateCcw, CheckCircle2, ExternalLink } from 'lucide-react';
import { shipmentsApi, type Shipment } from '@/lib/fulfillment-api';
import { ApiRequestError } from '@/lib/api';
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
        <button
          type="button"
          onClick={() => void reload()}
          className="flex items-center gap-2 rounded border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Refresh
        </button>
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
    </div>
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
