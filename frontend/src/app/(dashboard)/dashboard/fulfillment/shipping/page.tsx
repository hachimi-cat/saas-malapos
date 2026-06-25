'use client';

import { useEffect, useState, useMemo } from 'react';
import { Loader2, Save, MapPin, CheckCircle2, AlertCircle } from 'lucide-react';
import { shippingApi, type ShippingOrigin } from '@/lib/fulfillment-api';
import { ApiRequestError } from '@/lib/api';
import { FulfillmentModuleOff } from '@/components/fulfillment/module-off';

/*
 * Fulfillment → Shipping. malapos port of storlaunch's fulfillment/shipping
 * page over /api/v1/fulfillment/shipping. Set the pickup origin + pick which
 * couriers are enabled for the workspace (Fulkruma → Biteship). The
 * Origin & couriers settings on the older /dashboard/fulfillment/settings
 * page hit the equivalent /delivery surface; this is the module-menu home
 * for the same configuration.
 */

// A courier row from Fulkruma may arrive snake_case (raw Biteship) or
// camelCase (Fulkruma DTO) — normalise both into a code+name summary.
type RawCourier = Record<string, unknown>;

interface CourierSummary {
  code: string;
  name: string;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function summarize(rows: RawCourier[]): CourierSummary[] {
  const byCode = new Map<string, CourierSummary>();
  for (const r of rows) {
    const code = str(r.courier_code) ?? str(r.courierCode);
    if (!code) continue;
    const name = str(r.courier_name) ?? str(r.courierName) ?? code;
    if (!byCode.has(code)) byCode.set(code, { code, name });
  }
  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function ShippingSettingsPage() {
  const [origin, setOrigin] = useState<ShippingOrigin>({});
  const [contact, setContact] = useState({ contactName: '', contactPhone: '' });
  const [couriers, setCouriers] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<CourierSummary[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    Promise.all([
      shippingApi.getOrigin(),
      shippingApi.listCouriers().catch(() => {
        setCatalogError('Could not fetch the live courier list. Showing saved selections only.');
        return { data: [] as RawCourier[] };
      }),
    ])
      .then(([originRes, couriersRes]) => {
        const d = (originRes.data ?? {}) as ShippingOrigin;
        const raw = couriersRes.data;
        const rows = (Array.isArray(raw) ? raw : (raw?.couriers ?? raw?.data ?? [])) as RawCourier[];
        const summaries = summarize(rows);
        setCatalog(summaries);
        setOrigin(d);
        setContact({ contactName: d.contactName ?? '', contactPhone: d.contactPhone ?? '' });
        setCouriers(d.couriers?.length ? d.couriers : summaries.map((s) => s.code));
      })
      .catch((e) => {
        if (e instanceof ApiRequestError && e.status === 409) setModuleOff(true);
        else setError('Failed to load shipping settings');
      })
      .finally(() => setLoading(false));
  }, []);

  const hasInputs = useMemo(() => Boolean(origin.address || contact.contactName), [origin.address, contact.contactName]);

  function toggleCourier(code: string) {
    setCouriers((curr) => (curr.includes(code) ? curr.filter((c) => c !== code) : [...curr, code]));
  }

  function field<K extends keyof ShippingOrigin>(key: K, value: string) {
    setOrigin((o) => ({ ...o, [key]: value || null }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await shippingApi.updateOrigin({
        address: origin.address ?? null,
        city: origin.city ?? null,
        province: origin.province ?? null,
        postal: origin.postal ?? null,
        note: origin.note ?? null,
        lat: origin.lat ?? null,
        lng: origin.lng ?? null,
        contactName: contact.contactName,
        contactPhone: contact.contactPhone,
        couriers,
      });
      setSuccess('Shipping settings saved');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to save shipping settings');
    } finally {
      setSaving(false);
    }
  }

  if (moduleOff) return <FulfillmentModuleOff blurb="Shipping configures your Fulkruma pickup origin + couriers (Biteship). Turn on the Fulfillment module to set it up." />;
  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Shipping</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your pickup origin and the couriers enabled for this workspace. Powered by
          Fulkruma → Biteship.
        </p>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-500">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-medium">Pickup origin</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Address" value={origin.address ?? ''} onChange={(v) => field('address', v)} className="md:col-span-2" />
            <TextField label="City" value={origin.city ?? ''} onChange={(v) => field('city', v)} />
            <TextField label="Province" value={origin.province ?? ''} onChange={(v) => field('province', v)} />
            <TextField label="Postal code" value={origin.postal ?? ''} onChange={(v) => field('postal', v)} />
            <TextField label="Note" value={origin.note ?? ''} onChange={(v) => field('note', v)} />
            <TextField label="Contact name" required value={contact.contactName} onChange={(v) => setContact({ ...contact, contactName: v })} />
            <TextField label="Contact phone" required value={contact.contactPhone} onChange={(v) => setContact({ ...contact, contactPhone: v })} placeholder="081234567890" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Latitude/longitude (set on Fulkruma) are required for instant couriers like GoSend or Grab.
          </p>
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium">Enabled couriers</h2>
            <div className="flex gap-2">
              <button type="button" onClick={() => setCouriers(catalog.map((c) => c.code))} disabled={catalog.length === 0} className="text-xs text-primary hover:underline disabled:opacity-50">
                Enable all
              </button>
              <button type="button" onClick={() => setCouriers([])} className="text-xs text-muted-foreground hover:underline">
                Clear
              </button>
            </div>
          </div>
          {catalogError && (
            <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-500">{catalogError}</div>
          )}
          {catalog.length === 0 && !catalogError ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No couriers available yet. They appear once your Fulkruma workspace is provisioned.</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.map((courier) => (
                <label key={courier.code} className="flex cursor-pointer items-center gap-2 rounded border border-border bg-background p-3 text-sm hover:bg-muted">
                  <input type="checkbox" checked={couriers.includes(courier.code)} onChange={() => toggleCourier(courier.code)} className="h-4 w-4" />
                  <span className="font-medium">{courier.name}</span>
                  <span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{courier.code}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !hasInputs}
            className="flex items-center gap-2 rounded bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save settings
          </button>
        </div>
      </form>
    </div>
  );
}

function TextField({ label, required, value, onChange, placeholder, className }: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium">{label}{required && <span className="text-destructive"> *</span>}</label>
      <input
        type="text"
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}
