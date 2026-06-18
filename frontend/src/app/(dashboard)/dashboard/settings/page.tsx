'use client';

import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Check } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';

/*
 * Business settings — the one place a merchant tunes how Malapos behaves.
 * Business type is load-bearing: it tailors the sell screen (barcode-first
 * for retail, batch/expiry for pharmacy, modifiers for F&B). Currency is
 * IDR-only in v1. Loads on mount, saves via PUT /settings. Real backend.
 */

type BusinessType = 'GENERAL' | 'RETAIL' | 'FNB' | 'PHARMACY';

type SettingsRecord = {
  id: string;
  businessName: string;
  businessType: BusinessType;
  currency: string;
};

const TYPE_OPTIONS: { value: BusinessType; label: string; hint: string }[] = [
  { value: 'GENERAL', label: 'General', hint: 'A balanced default for any small business.' },
  { value: 'RETAIL', label: 'Retail', hint: 'Barcode scanning + SKU-first search on the sell screen.' },
  { value: 'FNB', label: 'F&B', hint: 'Menus, modifiers and table-friendly ordering.' },
  { value: 'PHARMACY', label: 'Pharmacy', hint: 'Batch and expiry tracking on stock and sales.' },
];

export default function SettingsPage() {
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('GENERAL');
  const [currency, setCurrency] = useState('IDR');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ settings: SettingsRecord }>('/settings');
        const s = res.data.settings;
        setBusinessName(s.businessName ?? '');
        setBusinessType(s.businessType ?? 'GENERAL');
        setCurrency(s.currency ?? 'IDR');
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await api.put<{ settings: SettingsRecord }>('/settings', {
        businessName: businessName.trim(),
        businessType,
        currency,
      });
      const s = res.data.settings;
      setBusinessName(s.businessName ?? '');
      setBusinessType(s.businessType ?? 'GENERAL');
      setCurrency(s.currency ?? 'IDR');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">Tune your business profile and how Malapos behaves.</p>
        </div>
      </div>

      <form onSubmit={save} className="mt-6 max-w-xl space-y-6 rounded-lg border border-border bg-card p-6">
        <label className="block">
          <span className="text-sm font-medium">Business name</span>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. Toko Sumber Rejeki"
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Business type</span>
          <select
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value as BusinessType)}
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs text-muted-foreground">
            {TYPE_OPTIONS.find((o) => o.value === businessType)?.hint}
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Currency</span>
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            readOnly
            className="mt-1.5 w-full cursor-not-allowed rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground outline-none"
          />
          <span className="mt-1.5 block text-xs text-muted-foreground">
            Only IDR (Indonesian Rupiah) is supported in v1.
          </span>
        </label>

        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Your business type tailors the sell screen — barcode-first search for retail, batch and expiry
          tracking for pharmacy, menus and modifiers for F&B. Change it any time as your shop grows.
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving || !businessName.trim()}
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-primary">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}
      </form>
    </div>
  );
}
