'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Send,
  Loader2,
  Package,
  Plus,
  X,
  RefreshCw,
  Truck,
  ExternalLink,
  Settings,
} from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';

/*
 * Delivery dashboard — the Fulfillment (Fulkruma → Biteship) module's
 * deep-link target (its "Shipments" sub-page). Lists shipments with their
 * live driver status and creates a delivery shipment for a recent sale
 * (quote rates → pick a courier → dispatch). The shipping origin + courier
 * list now live on the Delivery → Settings sub-page.
 *
 * Everything proxies through /api/v1/delivery, which is gated on the
 * Fulfillment module: when it's OFF the backend returns 409
 * FULFILLMENT_MODULE_DISABLED and this page shows the enable empty
 * state. Built against the real backend; no mock data.
 */

type Shipment = {
  id: string;
  status: string;
  courierCode: string;
  courierServiceCode: string;
  waybillId: string | null;
  trackingUrl: string | null;
  price: number;
  customerEmail: string | null;
  createdAt: string;
  destinationSnapshot?: Record<string, unknown>;
};

type RecentSale = {
  id: string;
  number: string;
  total: number;
  createdAt: string;
};

type Rate = {
  courierCode: string;
  courierServiceCode: string;
  courierName?: string;
  serviceName?: string;
  description?: string;
  price: number;
  duration?: string;
};

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === 'delivered') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  if (s === 'cancelled' || s === 'returned' || s === 'failed')
    return 'bg-destructive/10 text-destructive';
  if (s === 'pending' || s === 'confirmed' || s === 'allocated')
    return 'bg-muted text-muted-foreground';
  return 'bg-primary/10 text-primary';
}

function prettyStatus(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function DeliveryPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setModuleOff(false);
    try {
      const shipmentsRes = await api.get<Shipment[]>('/delivery/shipments');
      setShipments(shipmentsRes.data ?? []);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        setModuleOff(true);
      } else {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load delivery');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (moduleOff) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-lg border border-border bg-card px-8 py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Truck className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold">Enable the Fulfillment module</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Delivery uses Fulkruma to quote couriers, print labels, and track shipments across
            Indonesia (Biteship). Turn on the Fulfillment module to dispatch sales for delivery.
          </p>
          <Link
            href="/dashboard/settings/modules"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to Modules <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Send className="h-6 w-6 text-primary" /> Delivery
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dispatch sales for delivery and track couriers in real time. Powered by Fulkruma.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/delivery/settings"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <Settings className="h-4 w-4" /> Settings
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New delivery
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Package className="h-4 w-4 text-muted-foreground" /> Shipments
          </h2>
          <span className="text-xs text-muted-foreground">{shipments.length} total</span>
        </div>
        {shipments.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No shipments yet. Create one from a recent sale to get started.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {shipments.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.courierCode.toUpperCase()}</span>
                    <span className="text-xs text-muted-foreground">{s.courierServiceCode}</span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass(
                        s.status,
                      )}`}
                    >
                      {prettyStatus(s.status)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {s.waybillId ? `AWB ${s.waybillId} · ` : ''}
                    {formatDate(s.createdAt)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-medium">{rupiah(s.price)}</span>
                  {s.trackingUrl && (
                    <a
                      href={s.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Track <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {createOpen && (
        <CreateDeliveryModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Field({
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

// ── Create delivery modal ───────────────────────────────────────────
function CreateDeliveryModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [sales, setSales] = useState<RecentSale[]>([]);
  const [saleId, setSaleId] = useState('');
  const [dest, setDest] = useState({
    contactName: '',
    contactPhone: '',
    address: '',
    postalCode: '',
  });
  const [weight, setWeight] = useState('1000');
  const [rates, setRates] = useState<Rate[]>([]);
  const [picked, setPicked] = useState<Rate | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Recent completed sales — candidates to ship.
    api
      .get<RecentSale[]>('/sales?status=COMPLETED&limit=20')
      .then((r) => setSales(r.data ?? []))
      .catch(() => setSales([]));
  }, []);

  async function quote() {
    setLoadingRates(true);
    setError(null);
    setRates([]);
    setPicked(null);
    try {
      const { data } = await api.post<{ pricing?: Rate[] } | Rate[]>('/delivery/rates', {
        destination: {
          contactName: dest.contactName,
          contactPhone: dest.contactPhone,
          address: dest.address,
          postalCode: dest.postalCode,
        },
        items: [{ name: 'Order', weight: Number(weight) || 1000, quantity: 1 }],
      });
      // Fulkruma returns either an array of rates or an object wrapping
      // `pricing` — accept both shapes.
      const list = Array.isArray(data) ? data : ((data?.pricing as Rate[]) ?? []);
      setRates(list);
      if (list.length === 0) setError('No courier rates available for this destination.');
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to fetch rates');
    } finally {
      setLoadingRates(false);
    }
  }

  async function dispatch() {
    if (!picked) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/delivery/shipments', {
        transactionId: saleId || undefined,
        destination: {
          contactName: dest.contactName,
          contactPhone: dest.contactPhone,
          address: dest.address,
          postalCode: dest.postalCode,
        },
        courierCode: picked.courierCode,
        courierServiceCode: picked.courierServiceCode,
        price: picked.price,
        items: [{ name: 'Order', weight: Number(weight) || 1000, quantity: 1 }],
      });
      onCreated();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to create shipment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-semibold">New delivery</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Sale (optional)</span>
            <select
              value={saleId}
              onChange={(e) => setSaleId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              <option value="">— Not linked to a sale —</option>
              {sales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number} · {rupiah(s.total)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Recipient name"
              value={dest.contactName}
              onChange={(v) => setDest({ ...dest, contactName: v })}
            />
            <Field
              label="Recipient phone"
              value={dest.contactPhone}
              onChange={(v) => setDest({ ...dest, contactPhone: v })}
            />
          </div>
          <Field
            label="Destination address"
            value={dest.address}
            onChange={(v) => setDest({ ...dest, address: v })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Postal code"
              value={dest.postalCode}
              onChange={(v) => setDest({ ...dest, postalCode: v })}
            />
            <Field label="Weight (grams)" value={weight} onChange={setWeight} />
          </div>

          <button
            type="button"
            disabled={loadingRates || !dest.address}
            onClick={() => void quote()}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {loadingRates ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
            Get courier rates
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
                      {r.duration && (
                        <div className="text-xs text-muted-foreground">{r.duration}</div>
                      )}
                    </div>
                    <span className="font-medium">{rupiah(r.price)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!picked || submitting}
            onClick={() => void dispatch()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create shipment
          </button>
        </div>
      </div>
    </div>
  );
}
