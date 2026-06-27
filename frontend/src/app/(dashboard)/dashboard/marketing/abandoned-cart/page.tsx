'use client';

import { useEffect, useState } from 'react';
import { abandonedCartApi, discountCodesApi, type AbandonedCartConfig, type AbandonedCartReminder, type AbandonedCartStats, type DiscountCode } from '@/lib/marketing-api';
import { Loader2, Save, MailX, CheckCircle2, Clock, ShoppingBag } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import { CampaignSelect } from '@/components/marketing/campaign-select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
        // `res.data` is already the unwrapped envelope payload (lib/api.ts).
        // Config + stats are flat objects; reminders comes back as `{ items }`;
        // codes is the sendList array.
        const configData = configRes.data;
        const remindersData = (remindersRes.data as unknown as { items?: AbandonedCartReminder[] })?.items ?? [];
        const statsData = statsRes.data ?? null;
        const codesData = codesRes.data ?? [];
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
    <div className="space-y-6">
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
          <StatCard label="Recovered revenue" value={stats.recoveredValueAtSend > 0 ? fmt(stats.recoveredValueAtSend) : '—'} icon={CheckCircle2} />
        </section>
      )}

      {/* ── Config ────────────────────────────────────────────────────────── */}
      <Card className="space-y-4 p-5">
        <Label className="flex cursor-pointer items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Enable abandoned-cart reminders</div>
            <p className="text-xs text-muted-foreground">When off, no reminders are sent regardless of other fields.</p>
          </div>
          <Checkbox
            checked={form.enabled}
            onCheckedChange={(checked) => setForm({ ...form, enabled: checked === true })}
            className="h-5 w-5"
          />
        </Label>

        <div className="space-y-1.5">
          <Label htmlFor="delay">Delay after last cart activity</Label>
          <Select
            value={String(form.delayHours)}
            onValueChange={(v) => setForm({ ...form, delayHours: parseInt(v, 10) })}
          >
            <SelectTrigger id="delay">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 4, 8, 12, 24, 48, 72].map((h) => (
                <SelectItem key={h} value={String(h)}>{h} hour{h === 1 ? '' : 's'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Buyer-facing industry default is 4 hours. Longer delays feel less pushy but reduce recovery rate.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subject">Email subject</Label>
          <Input
            id="subject"
            value={form.emailSubject}
            onChange={(e) => setForm({ ...form, emailSubject: e.target.value })}
            maxLength={200}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="preview">Preview text</Label>
          <Input
            id="preview"
            value={form.emailPreview}
            onChange={(e) => setForm({ ...form, emailPreview: e.target.value })}
            maxLength={200}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Shown in the inbox list after the subject (Gmail / Apple Mail).</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="code">Attach discount code (optional)</Label>
          <Select
            value={form.discountCodeId ?? 'none'}
            onValueChange={(v) => setForm({ ...form, discountCodeId: v === 'none' ? null : v })}
          >
            <SelectTrigger id="code">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">(None)</SelectItem>
              {discountCodes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.code} — {c.description ?? `${c.type} ${c.value}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </Card>

      <section>
        <header className="mb-2 text-sm font-semibold">
          Recent reminders <span className="ml-1 text-xs font-normal text-muted-foreground">(last 50)</span>
        </header>
        {reminders.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No reminders yet. Once enabled, reminders will appear here after the first cron sweep.
          </Card>
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
                    <Badge variant="outline" className="gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-900">
                      <CheckCircle2 className="h-3 w-3" /> Recovered
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <Clock className="h-3 w-3" /> Pending
                    </Badge>
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
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </Card>
  );
}

function extractError(e: unknown): string | null {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? null;
}
