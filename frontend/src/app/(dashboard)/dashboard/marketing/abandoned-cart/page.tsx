'use client';

import { useEffect, useState } from 'react';
import { abandonedCartApi, discountCodesApi, type AbandonedCartConfig, type AbandonedCartReminder, type AbandonedCartStats, type DiscountCode } from '@/lib/marketing-api';
import { Loader2, Save, MailX, CheckCircle2, Clock, ShoppingBag } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import { CampaignSelect } from '@/components/marketing/campaign-select';

/**
 * /dashboard/marketing/abandoned-cart — opt-in recovery automation.
 * Configure delay + email copy + optional discount, see recent reminders
 * and recovery rate.
 */

export default function AbandonedCartPage() {
  const [form, setForm] = useState<AbandonedCartConfig>({
    enabled: false,
    delayHours: 4,
    emailSubject: 'You left something in your cart',
    emailPreview: 'Come back to finish your order',
    discountCodeId: null,
    marketingCampaignId: null,
  });
  const [reminders, setReminders] = useState<AbandonedCartReminder[]>([]);
  const [stats, setStats] = useState<AbandonedCartStats | null>(null);
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    Promise.all([
      abandonedCartApi.config.get(),
      abandonedCartApi.reminders({ limit: 50 }),
      abandonedCartApi.stats({ windowDays: 30 }),
      discountCodesApi.list({ active: true, limit: 100 }),
    ])
      .then(([configRes, remindersRes, statsRes, codesRes]) => {
        const configData = (configRes.data as { data?: AbandonedCartConfig })?.data ?? (configRes.data as AbandonedCartConfig);
        const remindersData = (remindersRes.data as { data?: AbandonedCartReminder[] })?.data ?? [];
        const statsData = (statsRes.data as { data?: AbandonedCartStats })?.data ?? null;
        const codesData = (codesRes.data as { data?: DiscountCode[] })?.data ?? [];
        setForm({
          enabled: configData.enabled ?? false,
          delayHours: configData.delayHours ?? 4,
          emailSubject: configData.emailSubject ?? 'You left something in your cart',
          emailPreview: configData.emailPreview ?? 'Come back to finish your order',
          discountCodeId: configData.discountCodeId ?? null,
          marketingCampaignId: configData.marketingCampaignId ?? null,
        });
        setReminders(Array.isArray(remindersData) ? remindersData : []);
        setStats(statsData);
        setDiscountCodes(Array.isArray(codesData) ? codesData : []);
      })
      .catch((e) => setError(extractError(e) ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setError(''); setSuccess('');
    try {
      await abandonedCartApi.config.update(form);
      setSuccess('Config saved. The next cron sweep (within 15 minutes) picks up the new settings.');
    } catch (e) {
      setError(extractError(e) ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const currency = stats?.currency ?? 'IDR';
  const fmt = (n: number) =>
    new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'id-ID', {
      style: 'currency', currency, minimumFractionDigits: 0,
    }).format(n);
  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 1) return 'less than 1h ago';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Abandoned cart recovery</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Opt-in reminder emails for buyers who add items and don&apos;t check out. Cron sweeps
          every 15 minutes. Reminders are sent at most once per cart per 72h, never to opted-out buyers.
        </p>
      </header>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">{success}</div>}

      {/* ── Stats (last 30d) ─────────────────────────────────────────────── */}
      {stats && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Reminders sent" value={stats.remindersSent.toLocaleString('en-US')} icon={MailX} />
          <StatCard label="Carts recovered" value={stats.cartsRecovered.toLocaleString('en-US')} icon={CheckCircle2} />
          <StatCard label="Recovery rate" value={fmtPct(stats.recoveryRate)} icon={ShoppingBag} />
          <StatCard label="Recovered revenue" value={stats.recoveredRevenue > 0 ? fmt(stats.recoveredRevenue) : '—'} icon={CheckCircle2} />
        </section>
      )}

      {/* ── Config ────────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Enable abandoned-cart reminders</div>
            <p className="text-xs text-muted-foreground">When off, no reminders are sent regardless of other fields.</p>
          </div>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            className="h-5 w-5"
          />
        </label>

        <div>
          <label htmlFor="delay" className="mb-1 block text-xs font-medium">Delay after last cart activity</label>
          <select
            id="delay"
            value={form.delayHours}
            onChange={(e) => setForm({ ...form, delayHours: parseInt(e.target.value, 10) })}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {[1, 2, 4, 8, 12, 24, 48, 72].map((h) => (
              <option key={h} value={h}>{h} hour{h === 1 ? '' : 's'}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Buyer-facing industry default is 4 hours. Longer delays feel less pushy but reduce recovery rate.
          </p>
        </div>

        <div>
          <label htmlFor="subject" className="mb-1 block text-xs font-medium">Email subject</label>
          <input
            id="subject"
            value={form.emailSubject}
            onChange={(e) => setForm({ ...form, emailSubject: e.target.value })}
            maxLength={200}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="preview" className="mb-1 block text-xs font-medium">Preview text</label>
          <input
            id="preview"
            value={form.emailPreview}
            onChange={(e) => setForm({ ...form, emailPreview: e.target.value })}
            maxLength={200}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Shown in the inbox list after the subject (Gmail / Apple Mail).</p>
        </div>

        <div>
          <label htmlFor="code" className="mb-1 block text-xs font-medium">Attach discount code (optional)</label>
          <select
            id="code"
            value={form.discountCodeId ?? ''}
            onChange={(e) => setForm({ ...form, discountCodeId: e.target.value || null })}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">(None)</option>
            {discountCodes.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.description ?? `${c.type} ${c.value}`}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Include a promo code in the reminder email to sweeten the recovery. Consider setting a per-customer cap
            on the code so the same buyer can&apos;t reuse it endlessly.
          </p>
        </div>

        <CampaignSelect
          value={form.marketingCampaignId ?? null}
          onChange={(id) => setForm({ ...form, marketingCampaignId: id })}
          disabled={saving}
        />

        <div className="flex items-center justify-end gap-3">
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

      <section>
        <header className="mb-2 text-sm font-semibold">
          Recent reminders <span className="ml-1 text-xs font-normal text-muted-foreground">(last 50)</span>
        </header>
        {reminders.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No reminders yet. Once enabled, reminders will appear here after the first cron sweep.
          </div>
        ) : (
          <DataTable
            rows={reminders}
            columns={[
              {
                key: 'sent',
                header: 'Sent',
                sortable: true,
                sortValue: (r) => new Date(r.sentAt).getTime(),
                searchValue: (r) => r.email,
                cell: (r) => <span className="text-xs text-muted-foreground">{relativeTime(r.sentAt)}</span>,
              },
              {
                key: 'email',
                header: 'Email',
                sortable: true,
                sortValue: (r) => r.email,
                cell: (r) => <span className="font-mono text-xs">{r.email}</span>,
              },
              {
                key: 'items',
                header: 'Items',
                align: 'right',
                sortable: true,
                sortValue: (r) => r.cartSnapshot?.length ?? 0,
                cell: (r) => <span className="text-xs">{r.cartSnapshot?.length ?? 0}</span>,
              },
              {
                key: 'value',
                header: 'Value',
                align: 'right',
                sortable: true,
                sortValue: (r) => r.valueAtSend,
                cell: (r) => (
                  <span className="font-mono text-xs">
                    {new Intl.NumberFormat(r.currencyAtSend === 'USD' ? 'en-US' : 'id-ID', {
                      style: 'currency', currency: r.currencyAtSend, minimumFractionDigits: 0,
                    }).format(r.valueAtSend)}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                sortable: true,
                sortValue: (r) => (r.recoveredAt ? 'recovered' : 'pending'),
                cell: (r) =>
                  r.recoveredAt ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-900">
                      <CheckCircle2 className="h-3 w-3" /> Recovered
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <Clock className="h-3 w-3" /> Pending
                    </span>
                  ),
              },
            ] as Column<AbandonedCartReminder>[]}
            filters={[
              {
                key: 'status',
                label: 'Status',
                accessor: (r) => (r.recoveredAt ? 'recovered' : 'pending'),
                options: [
                  { value: 'recovered', label: 'Recovered' },
                  { value: 'pending', label: 'Pending' },
                ],
              },
            ]}
            rowKey={(r) => r.id}
            searchPlaceholder="Search email…"
            defaultSort={{ key: 'sent', dir: 'desc' }}
            empty="No reminders match."
          />
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function extractError(e: unknown): string | null {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? null;
}
