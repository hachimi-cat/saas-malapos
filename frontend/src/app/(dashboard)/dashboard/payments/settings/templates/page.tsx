'use client';

import * as React from 'react';
import Link from 'next/link';
import { Building2, Copy, Loader2, Plus, Star, Trash2, Check } from 'lucide-react';
import {
  plugipaySettingsApi,
  type CheckoutSettings,
  type TemplateDTO,
  type TemplateKind,
} from '@/lib/plugipay-settings-api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const DEFAULTS: Record<TemplateKind, Record<string, unknown>> = {
  receipt: {
    thankYouText: 'Terima kasih — Thank you',
    footerText: null,
    showTax: false,
    taxLabel: 'PPN',
    taxRate: 0.11,
    cashierLabel: null,
    showBusinessDetails: true,
    accentColor: null,
  },
  invoice: {
    termsText: null,
    footerText: null,
    showTax: false,
    taxLabel: 'PPN',
    taxRate: 0.11,
    showBusinessDetails: true,
    accentColor: null,
  },
  checkout: {
    accentColor: null,
    successMessage: null,
    footerTagline: null,
    showBusinessDetails: false,
  },
};

const labelCls = 'mb-1.5 block text-xs font-medium text-foreground';
const helpCls = 'mt-1 text-[11px] text-muted-foreground';

export default function TemplatesPage() {
  const [tab, setTab] = React.useState<TemplateKind>('receipt');
  const [rows, setRows] = React.useState<TemplateDTO[] | null>(null);
  const [business, setBusiness] = React.useState<CheckoutSettings | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setRows(null);
    try {
      const list = (await plugipaySettingsApi.listTemplates(tab)) ?? [];
      setRows(list);
      if (!list.find((t) => t.id === selectedId)) {
        setSelectedId(list.find((t) => t.isDefault)?.id ?? list[0]?.id ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, [tab, selectedId]);

  React.useEffect(() => {
    load();
  }, [load]);
  React.useEffect(() => {
    plugipaySettingsApi.getCheckoutSettings().then(setBusiness).catch(() => {});
  }, []);

  const selected = rows?.find((t) => t.id === selectedId) ?? null;

  async function makeDefault(id: string) {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await plugipaySettingsApi.makeTemplateDefault(id);
      setInfo('Default template updated');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(id: string) {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const r = await plugipaySettingsApi.duplicateTemplate(id);
      setInfo(`Duplicated as ${r.name}`);
      setSelectedId(r.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await plugipaySettingsApi.deleteTemplate(id);
      setInfo('Template deleted');
      setSelectedId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function addNew() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const name = `New ${tab} template`;
      const created = await plugipaySettingsApi.createTemplate({ kind: tab, name, config: DEFAULTS[tab] });
      setSelectedId(created.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <nav className="text-xs text-muted-foreground">
        <Link href="/dashboard/settings/business" className="hover:text-foreground">
          Settings
        </Link>
        <span className="mx-1.5 text-muted-foreground/50">/</span>
        <span className="text-foreground">Templates</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
        <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">
          Checkout pages, receipts, and invoices — build multiple templates per kind and switch the default
          anytime. A mistake in the live template? Keep an old one around and flip the default back in one
          click.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {business?.brandLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.brandLogoUrl}
              alt=""
              className="h-8 w-8 shrink-0 rounded border border-border object-cover"
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {business?.brandName || <span className="italic text-muted-foreground">No business name set</span>}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              Logo · name · accent color · address · NPWP live on the Business page and feed every template here.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1.5">
          <Link href="/dashboard/settings/business">Edit business →</Link>
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as TemplateKind);
          setSelectedId(null);
        }}
      >
        <TabsList>
          {(['receipt', 'invoice', 'checkout'] as const).map((k) => (
            <TabsTrigger key={k} value={k} className="capitalize">
              {k} templates
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs font-mono text-red-400">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-border bg-green-500/10 px-3 py-2 text-xs font-mono text-green-400">
          {info}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {tab === 'receipt' ? 'Receipts' : tab === 'invoice' ? 'Invoices' : 'Checkout skins'}
            </h2>
            <Button type="button" variant="ghost" size="sm" onClick={addNew} disabled={busy} className="gap-1.5 text-muted-foreground">
              <Plus className="h-4 w-4" /> New
            </Button>
          </div>
          <div className="space-y-1">
            {!rows && (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
            {rows && rows.length === 0 && <p className="text-xs text-muted-foreground">No templates yet.</p>}
            {rows?.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={
                  'w-full rounded-md border px-3 py-2 text-left transition-colors ' +
                  (selectedId === t.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-primary/40')
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  {t.isDefault && (
                    <Badge className="gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase">
                      <Check className="h-3 w-3" /> Default
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        </Card>

        {selected ? (
          <TemplateEditor
            key={selected.id}
            template={selected}
            onSaved={load}
            onMakeDefault={() => makeDefault(selected.id)}
            onDuplicate={() => duplicate(selected.id)}
            onDelete={() => remove(selected.id)}
            busy={busy}
          />
        ) : (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            Select a template on the left, or create a new one.
          </Card>
        )}
      </div>
    </div>
  );
}

function TemplatePreview({ kind, config }: { kind: TemplateKind; config: Record<string, unknown> }) {
  const [html, setHtml] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const configKey = React.useMemo(() => JSON.stringify({ kind, config }), [kind, config]);

  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setError(null);
      try {
        // Mirror malapos's lib/api base-URL handling: NEXT_PUBLIC_API_URL may
        // be a bare origin (dev) or already include the prefix (CI sets the
        // relative '/api/v1'). Strip a trailing /api/v1 so it's added exactly
        // once. Auth rides the session cookie via credentials:'include'.
        const base = (
          (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
          'http://localhost:4191'
        ).replace(/\/api\/v1\/?$/, '');
        const res = await fetch(`${base}/api/v1/payments/plugipay-settings/templates/preview`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: configKey,
        });
        if (!res.ok) throw new Error(`preview ${res.status}`);
        // Preview endpoint streams raw HTML through the raw-passthrough
        // proxy — not envelope-wrapped. Use res.text() directly.
        const text = await res.text();
        if (!cancelled) setHtml(text);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Preview failed');
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [configKey]);

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold">Live preview</h3>
      {error && <div className="mb-2 font-mono text-xs text-red-400">{error}</div>}
      {html ? (
        <iframe
          srcDoc={html}
          className="h-[720px] w-full rounded border border-border bg-white"
          title="Template preview"
          sandbox="allow-same-origin"
        />
      ) : (
        <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rendering…
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Sample data for demonstration — real {kind}s pull the same template + your actual customer and amounts.
      </p>
    </Card>
  );
}

function TemplateEditor({
  template,
  onSaved,
  onMakeDefault,
  onDuplicate,
  onDelete,
  busy,
}: {
  template: TemplateDTO;
  onSaved: () => void;
  onMakeDefault: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [name, setName] = React.useState(template.name);
  const cfg = template.config as Record<string, unknown>;
  const [thankYouText, setThankYouText] = React.useState((cfg.thankYouText as string) ?? '');
  const [termsText, setTermsText] = React.useState((cfg.termsText as string) ?? '');
  const [footerText, setFooterText] = React.useState((cfg.footerText as string) ?? '');
  const [cashierLabel, setCashierLabel] = React.useState((cfg.cashierLabel as string) ?? '');
  const [successMessage, setSuccessMessage] = React.useState((cfg.successMessage as string) ?? '');
  const [footerTagline, setFooterTagline] = React.useState((cfg.footerTagline as string) ?? '');
  const [showTax, setShowTax] = React.useState(Boolean(cfg.showTax));
  const [taxLabel, setTaxLabel] = React.useState((cfg.taxLabel as string) ?? 'PPN');
  const [taxRate, setTaxRate] = React.useState(String(cfg.taxRate ?? 0.11));
  const defaultShowBiz = template.kind === 'checkout' ? false : true;
  const [showBusinessDetails, setShowBusinessDetails] = React.useState(
    (cfg.showBusinessDetails as boolean | undefined) ?? defaultShowBiz,
  );
  const [accentColor, setAccentColor] = React.useState((cfg.accentColor as string) ?? '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const rate = Number.parseFloat(taxRate);
      let config: Record<string, unknown>;
      if (template.kind === 'receipt') {
        config = {
          thankYouText: thankYouText.trim() || undefined,
          footerText: footerText.trim() || null,
          cashierLabel: cashierLabel.trim() || null,
          showTax,
          taxLabel: taxLabel.trim() || 'PPN',
          taxRate: Number.isFinite(rate) ? rate : 0.11,
          showBusinessDetails,
          accentColor: accentColor.trim() || null,
        };
      } else if (template.kind === 'invoice') {
        config = {
          termsText: termsText.trim() || null,
          footerText: footerText.trim() || null,
          showTax,
          taxLabel: taxLabel.trim() || 'PPN',
          taxRate: Number.isFinite(rate) ? rate : 0.11,
          showBusinessDetails,
          accentColor: accentColor.trim() || null,
        };
      } else {
        config = {
          accentColor: accentColor.trim() || null,
          successMessage: successMessage.trim() || null,
          footerTagline: footerTagline.trim() || null,
          showBusinessDetails,
        };
      }
      await plugipaySettingsApi.updateTemplate(template.id, { name: name.trim() || template.name, config });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{template.name}</h2>
          <div className="flex items-center gap-2">
            {!template.isDefault && (
              <Button type="button" variant="ghost" size="sm" onClick={onMakeDefault} disabled={busy} className="gap-1.5 text-muted-foreground">
                <Star className="h-3.5 w-3.5" /> Make default
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={onDuplicate} disabled={busy} className="gap-1.5 text-muted-foreground">
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </Button>
            {!template.isDefault && (
              <Button type="button" variant="ghost" size="sm" onClick={onDelete} disabled={busy} className="gap-1.5 text-muted-foreground">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs font-mono text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label htmlFor="tpl-name" className={labelCls}>Template name</Label>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {template.kind === 'receipt' && (
            <>
              <div>
                <Label htmlFor="tpl-thanks" className={labelCls}>Thank-you line</Label>
                <Input
                  id="tpl-thanks"
                  value={thankYouText}
                  onChange={(e) => setThankYouText(e.target.value)}
                  placeholder="Terima kasih — Thank you"
                />
              </div>
              <div>
                <Label htmlFor="tpl-cashier" className={labelCls}>Default cashier label (POS)</Label>
                <Input
                  id="tpl-cashier"
                  value={cashierLabel}
                  onChange={(e) => setCashierLabel(e.target.value)}
                  placeholder="Kasir: Siti"
                />
                <p className={helpCls}>
                  Overridden per-session when POS sends <code>metadata.cashierName</code>.
                </p>
              </div>
            </>
          )}

          {template.kind === 'invoice' && (
            <div>
              <Label htmlFor="tpl-terms" className={labelCls}>Terms / payment instructions</Label>
              <Input
                id="tpl-terms"
                value={termsText}
                onChange={(e) => setTermsText(e.target.value)}
                placeholder="Payment due within 30 days. Wire to BCA 0987-6543-21."
              />
            </div>
          )}

          {template.kind === 'checkout' && (
            <>
              <div>
                <Label htmlFor="tpl-success" className={labelCls}>Success message</Label>
                <Input
                  id="tpl-success"
                  value={successMessage}
                  onChange={(e) => setSuccessMessage(e.target.value)}
                  placeholder="Thanks! A receipt is on its way to your inbox."
                />
                <p className={helpCls}>
                  Shown to the customer after a successful payment on <code>/c/:sessionId</code>.
                </p>
              </div>
              <div>
                <Label htmlFor="tpl-tagline" className={labelCls}>Footer tagline</Label>
                <Input
                  id="tpl-tagline"
                  value={footerTagline}
                  onChange={(e) => setFooterTagline(e.target.value)}
                  placeholder="Secure checkout powered by Plugipay"
                />
                <p className={helpCls}>Overrides the brand tagline on this checkout skin only.</p>
              </div>
            </>
          )}

          {template.kind !== 'checkout' && (
            <>
              <div>
                <Label htmlFor="tpl-footer" className={labelCls}>Footer text</Label>
                <Input
                  id="tpl-footer"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="Follow us on Instagram @warungkami"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="tpl-showtax"
                    checked={showTax}
                    onCheckedChange={(c) => setShowTax(c === true)}
                  />
                  <Label htmlFor="tpl-showtax" className="cursor-pointer text-sm font-normal">
                    Show tax breakdown
                  </Label>
                </div>
                {showTax && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div>
                      <Label htmlFor="tpl-tax-lbl" className={labelCls}>Tax label</Label>
                      <Input
                        id="tpl-tax-lbl"
                        value={taxLabel}
                        onChange={(e) => setTaxLabel(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="tpl-tax-rate" className={labelCls}>Rate (0–1)</Label>
                      <Input
                        id="tpl-tax-rate"
                        inputMode="decimal"
                        value={taxRate}
                        onChange={(e) => setTaxRate(e.target.value)}
                      />
                      <p className={helpCls}>0.11 = 11%</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="tpl-showbiz"
              checked={showBusinessDetails}
              onCheckedChange={(c) => setShowBusinessDetails(c === true)}
            />
            <Label htmlFor="tpl-showbiz" className="cursor-pointer text-sm font-normal">
              Show business details (address, NPWP)
            </Label>
          </div>
          <p className={helpCls}>
            Address + NPWP live under{' '}
            <Link href="/dashboard/settings/business" className="underline">
              Checkout settings → Business profile
            </Link>
            .
          </p>

          <div>
            <Label htmlFor="tpl-accent" className={labelCls}>Accent color override (optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                aria-label="Template accent color"
                value={accentColor || '#A16207'}
                onChange={(e) => setAccentColor(e.target.value.toUpperCase())}
                className="h-9 w-10 shrink-0 cursor-pointer p-1"
              />
              <Input
                id="tpl-accent"
                placeholder="Leave blank = use brand color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save template
            </Button>
          </div>
        </div>
      </Card>

      <TemplatePreview
        kind={template.kind}
        config={
          template.kind === 'receipt'
            ? {
                ...(thankYouText ? { thankYouText } : {}),
                footerText: footerText || null,
                cashierLabel: cashierLabel || null,
                showTax,
                taxLabel,
                taxRate: Number.parseFloat(taxRate) || 0.11,
                showBusinessDetails,
                accentColor: accentColor || null,
              }
            : template.kind === 'invoice'
              ? {
                  termsText: termsText || null,
                  footerText: footerText || null,
                  showTax,
                  taxLabel,
                  taxRate: Number.parseFloat(taxRate) || 0.11,
                  showBusinessDetails,
                  accentColor: accentColor || null,
                }
              : {
                  accentColor: accentColor || null,
                  successMessage: successMessage || null,
                  footerTagline: footerTagline || null,
                  showBusinessDetails,
                }
        }
      />
    </div>
  );
}
