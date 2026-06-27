'use client';

import { useEffect, useState } from 'react';
import { pixelsApi, type MerchantPixelsConfig } from '@/lib/marketing-api';
import { Loader2, Save, BarChart3, Eye, EyeOff, CheckCircle2, Activity, Target } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/**
 * /dashboard/marketing/pixels — per-merchant conversion tracking setup.
 * Meta Pixel + CAPI, Google Analytics 4 + Google Ads conversions, TikTok
 * Pixel. Sellers enter their own IDs; the storefront reads the non-secret
 * subset and injects the scripts on every page.
 */

export default function PixelsPage() {
  const [form, setForm] = useState<MerchantPixelsConfig>({
    metaPixelId: null,
    metaCapiAccessToken: null,
    metaTestEventCode: null,
    googleAnalyticsId: null,
    googleAdsConversionId: null,
    googleAdsPurchaseLabel: null,
    tiktokPixelId: null,
    enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCapiToken, setShowCapiToken] = useState(false);

  useEffect(() => {
    pixelsApi
      .get()
      .then((res) => {
        // `res.data` is already the unwrapped envelope payload (lib/api.ts).
        const data = res.data;
        setForm({
          metaPixelId: data.metaPixelId ?? null,
          metaCapiAccessToken: data.metaCapiAccessToken ?? null,
          metaTestEventCode: data.metaTestEventCode ?? null,
          googleAnalyticsId: data.googleAnalyticsId ?? null,
          googleAdsConversionId: data.googleAdsConversionId ?? null,
          googleAdsPurchaseLabel: data.googleAdsPurchaseLabel ?? null,
          tiktokPixelId: data.tiktokPixelId ?? null,
          enabled: data.enabled ?? true,
        });
      })
      .catch((e) => setError(extractError(e) ?? 'Failed to load pixel config'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setError(''); setSuccess('');
    try {
      await pixelsApi.update(form);
      setSuccess('Pixel config saved. Storefront picks up new IDs within a minute.');
    } catch (e: unknown) {
      setError(extractError(e) ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const hasAny = !!(form.metaPixelId || form.googleAnalyticsId || form.googleAdsConversionId || form.tiktokPixelId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight font-display">Pixels &amp; Conversion Tracking</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-merchant tracking pixels for Meta, Google, and TikTok ads. Configure the IDs you use
          and the storefront injects the scripts + emits standard ecommerce events (PageView,
          ViewContent, AddToCart, InitiateCheckout, Purchase).
        </p>
      </header>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">{success}</div>}

      <Card>
        <label className="flex cursor-pointer items-center justify-between gap-3 p-4">
          <div>
            <div className="text-sm font-medium">Enable pixel tracking</div>
            <p className="text-xs text-muted-foreground">Turn the whole system on/off without clearing IDs.</p>
          </div>
          <Switch
            checked={form.enabled}
            onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
          />
        </label>
      </Card>

      {/* ── Meta Pixel + CAPI ─────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-600" />
          <h2 className="text-sm font-semibold font-display">Meta Pixel &amp; Conversions API</h2>
          {form.metaPixelId && <CheckCircle2 className="h-4 w-4 text-green-600" />}
        </div>
        <div className="space-y-3">
          <Field
            id="meta-pixel"
            label="Pixel ID"
            hint="Meta Events Manager → Data Sources → your Pixel → top-right ID (15-digit number)"
            value={form.metaPixelId ?? ''}
            onChange={(v) => setForm({ ...form, metaPixelId: v || null })}
            placeholder="1234567890123456"
          />
          <Field
            id="meta-capi"
            label="Conversions API access token"
            hint="Events Manager → Settings → Conversions API → Generate access token. Used for server-side Purchase events (iOS/ad-blocker backup)."
            value={form.metaCapiAccessToken ?? ''}
            onChange={(v) => setForm({ ...form, metaCapiAccessToken: v || null })}
            placeholder="EAAB..."
            type={showCapiToken ? 'text' : 'password'}
            rightSlot={(
              <Button type="button" variant="ghost" size="icon"
                onClick={() => setShowCapiToken((x) => !x)}
                className="h-6 w-6 text-muted-foreground hover:text-foreground">
                {showCapiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            )}
          />
          <Field
            id="meta-test"
            label="Test event code (optional)"
            hint="From Events Manager → Test Events. When set, CAPI events appear in the Test Events tab instead of live."
            value={form.metaTestEventCode ?? ''}
            onChange={(v) => setForm({ ...form, metaTestEventCode: v || null })}
            placeholder="TEST12345"
          />
        </div>
      </Card>

      {/* ── Google ────────────────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-orange-600" />
          <h2 className="text-sm font-semibold font-display">Google Analytics &amp; Google Ads</h2>
          {form.googleAnalyticsId && <CheckCircle2 className="h-4 w-4 text-green-600" />}
        </div>
        <div className="space-y-3">
          <Field
            id="ga-id"
            label="Google Analytics 4 measurement ID"
            hint="GA4 Admin → Data Streams → Web → Measurement ID (starts with G-)"
            value={form.googleAnalyticsId ?? ''}
            onChange={(v) => setForm({ ...form, googleAnalyticsId: v || null })}
            placeholder="G-XXXXXXXXXX"
          />
          <Field
            id="ads-id"
            label="Google Ads conversion ID (optional)"
            hint="Google Ads → Tools → Conversions → Tag setup → Google tag ID (starts with AW-)"
            value={form.googleAdsConversionId ?? ''}
            onChange={(v) => setForm({ ...form, googleAdsConversionId: v || null })}
            placeholder="AW-XXXXXXXXX"
          />
          <Field
            id="ads-label"
            label="Google Ads purchase conversion label (optional)"
            hint="The Label under a specific Conversion Action — used to attribute only the Purchase event."
            value={form.googleAdsPurchaseLabel ?? ''}
            onChange={(v) => setForm({ ...form, googleAdsPurchaseLabel: v || null })}
            placeholder="abcDEFghijKLmnop"
          />
        </div>
      </Card>

      {/* ── TikTok ────────────────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-pink-600" />
          <h2 className="text-sm font-semibold font-display">TikTok Pixel</h2>
          {form.tiktokPixelId && <CheckCircle2 className="h-4 w-4 text-green-600" />}
        </div>
        <Field
          id="tiktok-pixel"
          label="Pixel ID"
          hint="TikTok Events Manager → Web → your Pixel → Settings → Pixel ID"
          value={form.tiktokPixelId ?? ''}
          onChange={(v) => setForm({ ...form, tiktokPixelId: v || null })}
          placeholder="C123ABC..."
        />
      </Card>

      <Card className="flex items-center justify-between bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground">
          {hasAny ? 'Storefront re-fetches pixel config every 60 seconds — new IDs go live shortly after save.'
                  : 'No pixels configured yet. The storefront injects nothing until you save at least one ID.'}
        </p>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </Card>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  rightSlot?: React.ReactNode;
}

function Field({ id, label, hint, value, onChange, placeholder, type = 'text', rightSlot }: FieldProps) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1 block text-xs font-medium">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10 font-mono"
        />
        {rightSlot && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</div>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function extractError(e: unknown): string | null {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? null;
}
