'use client';

import { useEffect, useState } from 'react';
import { feedsApi, type MerchantFeedConfig } from '@/lib/marketing-api';
import { Loader2, Save, Copy, Check, ExternalLink, Rss, AlertTriangle, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { CampaignSelect } from '@/components/marketing/campaign-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

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
        // `res.data` is already the unwrapped envelope payload (lib/api.ts).
        if (res.data) setForm(res.data);
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
      if (res.data) setForm(res.data);
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
    <div className="space-y-6">
      <PageHeader
        title="Product feeds"
        description="Auto-generated Google Shopping / Meta Catalog / TikTok Catalog feeds. Submit one URL per platform and your products show up in image-rich Shopping ads, Advantage+ Catalog campaigns, and TikTok Shop ads. Feeds refresh on every request; ad networks poll daily."
      />

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {success && <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-primary">{success}</div>}

      {/* ── Config ─────────────────────────────────────────────────────── */}
      <Card className="space-y-4 p-5">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Feeds enabled</div>
            <p className="text-xs text-muted-foreground">When off, the public feed URLs return 404 — ad networks stop pulling.</p>
          </div>
          <Checkbox
            checked={form.enabled}
            onCheckedChange={(v) => setForm({ ...form, enabled: v === true })}
            className="h-5 w-5"
          />
        </label>

        <div className="space-y-1.5">
          <Label htmlFor="cat">Default Google product category</Label>
          <Input
            id="cat"
            value={form.defaultGoogleProductCategory ?? ''}
            onChange={(e) => setForm({ ...form, defaultGoogleProductCategory: e.target.value || null })}
            placeholder="Apparel & Accessories > Clothing > Shirts & Tops"
          />
          <p className="text-xs text-muted-foreground">
            Path or numeric taxonomy ID. Applied to products that don&apos;t set their own category.{' '}
            <a href="https://support.google.com/merchants/answer/1705911" target="_blank" rel="noreferrer"
              className="text-primary hover:underline">Find yours →</a>
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <Checkbox
            checked={form.includeUnpublished}
            onCheckedChange={(v) => setForm({ ...form, includeUnpublished: v === true })}
            className="mt-0.5 h-5 w-5"
          />
          <div>
            <div className="flex items-center gap-1 text-sm font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              Include draft (unpublished) products
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
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
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </Card>

      {/* ── Feed URLs ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <header className="text-sm font-semibold font-display">Feed URLs</header>
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
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Rss className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-sm font-semibold font-display">{platform}</CardTitle>
      </CardHeader>
      <CardContent>
      <div className="flex items-stretch gap-2">
        <Input readOnly value={url} className="flex-1 bg-muted/30 font-mono text-xs" />
        <Button type="button" variant="outline" onClick={onCopy}>
          {copied ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
        </Button>
        <Button asChild variant="outline">
          <a href={previewHref} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Preview
          </a>
        </Button>
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
      </CardContent>
    </Card>
  );
}

function extractError(e: unknown): string | null {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? null;
}
