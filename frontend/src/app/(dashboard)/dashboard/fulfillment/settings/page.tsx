'use client';

import { useEffect, useState } from 'react';
import { Truck, Loader2, MapPin, RefreshCw, Settings } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { FulfillmentModuleOff } from '@/components/fulfillment/module-off';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/*
 * Delivery settings — the Fulfillment (Fulkruma) module's "Settings"
 * sub-page. Set the merchant's shipping origin (GET/PATCH
 * /delivery/origin) and list the couriers available to the workspace
 * (GET /delivery/couriers). The main /dashboard/fulfillment page is the
 * shipments list; origin editing lives here. When the Fulfillment module
 * is OFF the backend returns 409 and this page shows the enable empty
 * state. Built against the real backend; no mock data.
 */

type ShippingOrigin = {
  contactName?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  postal?: string | null;
  city?: string | null;
  province?: string | null;
  [key: string]: unknown;
} | null;

type Courier = {
  courierCode?: string;
  courierName?: string;
  courierServiceCode?: string;
  courierServiceName?: string;
  description?: string;
  [key: string]: unknown;
};

export default function DeliverySettingsPage() {
  const [origin, setOrigin] = useState<ShippingOrigin>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setModuleOff(false);
    try {
      const [originRes, couriersRes] = await Promise.all([
        api.get<ShippingOrigin>('/delivery/origin'),
        // Couriers may return an array or a wrapper object — accept both.
        api.get<Courier[] | { couriers?: Courier[]; data?: Courier[] }>('/delivery/couriers'),
      ]);
      setOrigin(originRes.data);
      const c = couriersRes.data;
      const list = Array.isArray(c) ? c : (c?.couriers ?? c?.data ?? []);
      setCouriers(list ?? []);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        setModuleOff(true);
      } else {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load delivery settings');
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
      <div>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (moduleOff) {
    return (
      <FulfillmentModuleOff blurb="Delivery uses Fulkruma to quote couriers, print labels, and track shipments across Indonesia. Turn on the Fulfillment module to set your pickup origin and dispatch sales." />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight font-display">
            <Settings className="h-5 w-5 text-primary" /> Delivery settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your pickup origin and the couriers available to your workspace. Powered by Fulkruma.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <OriginCard origin={origin} onSaved={(o) => setOrigin(o)} onError={setError} />

      {/* Couriers */}
      <Card>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="flex items-center gap-2 font-semibold font-display">
            <Truck className="h-4 w-4 text-muted-foreground" /> Available couriers
          </h2>
          <span className="text-xs text-muted-foreground">{couriers.length} total</span>
        </div>
        {couriers.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No couriers available yet. They appear once your Fulkruma workspace is provisioned.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {couriers.map((c, i) => (
              <div
                key={`${c.courierCode ?? 'courier'}-${c.courierServiceCode ?? i}`}
                className="flex items-center justify-between gap-4 px-6 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {(c.courierName ?? c.courierCode ?? 'Courier').toString().toUpperCase()}
                    {c.courierServiceName || c.courierServiceCode ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {c.courierServiceName ?? c.courierServiceCode}
                      </span>
                    ) : null}
                  </div>
                  {c.description ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">{c.description}</div>
                  ) : null}
                </div>
                {c.courierCode ? (
                  <span className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {c.courierCode}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Shipping origin card (moved here from the main delivery page) ──────
function OriginCard({
  origin,
  onSaved,
  onError,
}: {
  origin: ShippingOrigin;
  onSaved: (o: ShippingOrigin) => void;
  onError: (msg: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    contactName: origin?.contactName ?? '',
    contactPhone: origin?.contactPhone ?? '',
    address: origin?.address ?? '',
    postal: origin?.postal ?? '',
  });

  useEffect(() => {
    setForm({
      contactName: origin?.contactName ?? '',
      contactPhone: origin?.contactPhone ?? '',
      address: origin?.address ?? '',
      postal: origin?.postal ?? '',
    });
  }, [origin]);

  async function save() {
    setSaving(true);
    onError(null);
    try {
      const { data } = await api.patch<ShippingOrigin>('/delivery/origin', form);
      onSaved(data);
      setEditing(false);
    } catch (e) {
      onError(e instanceof ApiRequestError ? e.message : 'Failed to save origin');
    } finally {
      setSaving(false);
    }
  }

  const hasOrigin = origin && (origin.address || origin.contactName);

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="flex items-center gap-2 font-semibold font-display">
          <MapPin className="h-4 w-4 text-muted-foreground" /> Shipping origin
        </h2>
        {!editing && (
          <Button type="button" variant="link" className="h-auto p-0" onClick={() => setEditing(true)}>
            {hasOrigin ? 'Edit' : 'Set origin'}
          </Button>
        )}
      </div>
      <div className="px-6 py-4">
        {editing ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Contact name"
                value={form.contactName}
                onChange={(v) => setForm({ ...form, contactName: v })}
              />
              <Field
                label="Contact phone"
                value={form.contactPhone}
                onChange={(v) => setForm({ ...form, contactPhone: v })}
              />
            </div>
            <Field
              label="Address"
              value={form.address}
              onChange={(v) => setForm({ ...form, address: v })}
            />
            <Field
              label="Postal code"
              value={form.postal}
              onChange={(v) => setForm({ ...form, postal: v })}
            />
            <div className="flex items-center gap-2 pt-1">
              <Button type="button" disabled={saving} onClick={() => void save()}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save origin
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : hasOrigin ? (
          <div className="text-sm">
            <div className="font-medium">{origin?.contactName}</div>
            <div className="text-muted-foreground">{origin?.contactPhone}</div>
            <div className="mt-1 text-muted-foreground">
              {origin?.address}
              {origin?.postal ? ` · ${origin.postal}` : ''}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No shipping origin set. Add your pickup address so couriers know where to collect
            parcels.
          </p>
        )}
      </div>
    </Card>
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
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
