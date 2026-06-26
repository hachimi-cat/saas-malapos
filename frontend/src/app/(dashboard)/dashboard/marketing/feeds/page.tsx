'use client';

import { useEffect, useState } from 'react';
import { feedsApi, type MerchantFeedConfig } from '@/lib/marketing-api';
import { Loader2, Save, Copy, Check, ExternalLink, Rss, AlertTriangle, ChevronRight } from 'lucide-react';
import { CampaignSelect } from '@/components/marketing/campaign-select';

/**
 * /dashboard/marketing/feeds — auto-generated product feeds for the three
 * ad-network catalog managers. The merchant configures preferences here
 * and copies the URLs into Google Merchant Center / Meta Commerce Manager
 * / TikTok Catalog Manager.
 */

export default function FeedsPage() {
  const [form, setForm] = useState<MerchantFeedConfig>({
    enabled: true,
    defaultGoogleProductCategory: null,
    includeUnpublished: false,
    marketingCampaignId: null,
    urls: { google: '', meta: '', tiktok: '' },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    feedsApi
      .get()
      .then((res) => {
        const data = (res.data as { data?: MerchantFeedConfig })?.data ?? (res.data as MerchantFeedConfig);
        setForm(data);
      })
      .catch((e) => setError(extractError(e) ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await feedsApi.update({
        enabled: form.enabled,
        defaultGoogleProductCategory: form.defaultGoogleProductCategory,
        includeUnpublished: form.includeUnpublished,
        marketingCampaignId: form.marketingCampaignId,
      });
      const data = (res.data as { data?: MerchantFeedConfig })?.data ?? (res.data as MerchantFeedConfig);
      setForm(data);
      setSuccess('Feed config saved. Ad networks pull on their own schedule (typically daily).');
    } catch (e) {
      setError(extractError(e) ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function copyUrl(label: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch { /* clipboard may be blocked in insecure contexts */ }
  }

  if (loading) {
    return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Product feeds</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Auto-generated Google Shopping / Meta Catalog / TikTok Catalog feeds. Submit one URL per
          platform and your products show up in image-rich Shopping ads, Advantage+ Catalog
          campaigns, and TikTok Shop ads. Feeds refresh on every request; ad networks poll daily.
        </p>
      </header>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">{success}</div>}

      {/* ── Config ─────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Feeds enabled</div>
            <p className="text-xs text-muted-foreground">When off, the public feed URLs return 404 — ad networks stop pulling.</p>
          </div>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            className="h-5 w-5"
          />
        </label>

        <div>
          <label htmlFor="cat" className="mb-1 block text-xs font-medium">Default Google product category</label>
          <input
            id="cat"
            value={form.defaultGoogleProductCategory ?? ''}
            onChange={(e) => setForm({ ...form, defaultGoogleProductCategory: e.target.value || null })}
            placeholder="Apparel & Accessories > Clothing > Shirts & Tops"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Path or numeric taxonomy ID. Applied to products that don&apos;t set their own category.{' '}
            <a href="https://support.google.com/merchants/answer/1705911" target="_blank" rel="noreferrer"
              className="text-primary hover:underline">Find yours →</a>
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <input
            type="checkbox"
            checked={form.includeUnpublished}
            onChange={(e) => setForm({ ...form, includeUnpublished: e.target.checked })}
            className="mt-0.5 h-5 w-5"
          />
          <div>
            <div className="flex items-center gap-1 text-sm font-medium text-amber-900">
              <AlertTriangle className="h-3.5 w-3.5" />
              Include draft (unpublished) products
            </div>
            <p className="mt-0.5 text-xs text-amber-800">
              When on, products with <code>published=false</code> appear in ad-network catalogs. Off by default.
            </p>
          </div>
        </label>

        <CampaignSelect
          value={form.marketingCampaignId ?? null}
          onChange={(id) => setForm({ ...form, marketingCampaignId: id })}
          disabled={saving}
        />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </section>

      {/* ── Feed URLs ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <header className="text-sm font-semibold">Feed URLs</header>
        <FeedUrlCard
          platform="Google Shopping"
          url={form.urls.google}
          previewHref={feedsApi.previewUrl('google')}
          copied={copied === 'google'}
          onCopy={() => copyUrl('google', form.urls.google)}
          steps={[
            'Merchant Center → Products → Feeds → +',
            'Country + Language',
            'Name → Scheduled fetch',
            'Paste the URL, fetch daily',
          ]}
        />
        <FeedUrlCard
          platform="Meta Catalog"
          url={form.urls.meta}
          previewHref={feedsApi.previewUrl('meta')}
          copied={copied === 'meta'}
          onCopy={() => copyUrl('meta', form.urls.meta)}
          steps={[
            'Commerce Manager → Catalog → Data Sources',
            'Add items → Use a data feed',
            'Paste the URL, choose Daily',
          ]}
        />
        <FeedUrlCard
          platform="TikTok Catalog"
          url={form.urls.tiktok}
          previewHref={feedsApi.previewUrl('tiktok')}
          copied={copied === 'tiktok'}
          onCopy={() => copyUrl('tiktok', form.urls.tiktok)}
          steps={[
            'Catalog Manager → Data source → Add source',
            'Data feed → Paste URL',
            'Frequency → Daily',
          ]}
        />
      </section>

      <p className="text-xs text-muted-foreground">
        Reminder: per-product feed fields (GTIN, brand override, Google category, exclude-from-feeds)
        live in the product editor under the Feeds section.
      </p>
    </div>
  );
}

function FeedUrlCard({ platform, url, previewHref, copied, onCopy, steps }: {
  platform: string;
  url: string;
  previewHref: string;
  copied: boolean;
  onCopy: () => void;
  steps: string[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Rss className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{platform}</h3>
      </div>
      <div className="flex items-stretch gap-2">
        <input readOnly value={url} className="flex-1 rounded border border-border bg-muted/30 px-3 py-2 font-mono text-xs" />
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
        >
          {copied ? <><Check className="h-3.5 w-3.5 text-green-600" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
        </button>
        <a
          href={previewHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Preview
        </a>
      </div>
      <details className="group mt-2">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
          Submission steps
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </details>
    </div>
  );
}

function extractError(e: unknown): string | null {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? null;
}
