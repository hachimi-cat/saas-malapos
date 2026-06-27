'use client';

import { useEffect, useState } from 'react';
import {
  referralsApi,
  type ReferralProgramConfig,
  type ReferralLinkRow,
  type ReferralAttributionRow,
  type ReferralProgramStats,
} from '@/lib/marketing-api';
import {
  Loader2,
  Save,
  Gift,
  Users,
  MousePointerClick,
  TrendingUp,
  DollarSign,
} from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import { CampaignSelect } from '@/components/marketing/campaign-select';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * /dashboard/marketing/referrals — per-merchant referral program (Phase F.5).
 * Config + stats + top referrers + recent attributions.
 */

const DEFAULT_CONFIG: ReferralProgramConfig = {
  enabled: false,
  rewardType: 'percent',
  referrerValue: 10,
  refereeValue: 10,
  currency: 'IDR',
  minPurchaseAmount: null,
  rewardExpiryDays: 90,
  attributionWindowDays: 30,
  maxRewardsPerReferrer: null,
  programTerms: null,
  marketingCampaignId: null,
};

export default function ReferralsPage() {
  const [form, setForm] = useState<ReferralProgramConfig>(DEFAULT_CONFIG);
  const [stats, setStats] = useState<ReferralProgramStats | null>(null);
  const [links, setLinks] = useState<ReferralLinkRow[]>([]);
  const [attributions, setAttributions] = useState<ReferralAttributionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    Promise.all([
      referralsApi.get(),
      referralsApi.stats(),
      referralsApi.links({ limit: 20 }),
      referralsApi.attributions({ limit: 20 }),
    ])
      .then(([cfgRes, statsRes, linksRes, attribRes]) => {
        // `res.data` is already the unwrapped envelope payload (lib/api.ts):
        // program + stats are flat; links/attributions come back as `{ rows }`.
        setForm({ ...DEFAULT_CONFIG, ...(cfgRes.data ?? {}) });
        setStats(statsRes.data ?? null);
        setLinks(linksRes.data?.rows ?? []);
        setAttributions(attribRes.data?.rows ?? []);
      })
      .catch((e) => setError(extractError(e) ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setError(''); setSuccess('');
    try {
      await referralsApi.update(form);
      setSuccess('Program saved. Changes take effect on the next buyer signup or storefront visit.');
      const statsRes = await referralsApi.stats();
      setStats(statsRes.data ?? null);
    } catch (e) {
      setError(extractError(e) ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const isPercent = form.rewardType === 'percent' || form.rewardType === 'shipping_percent';
  const currency = form.currency || 'IDR';
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
        <h1 className="text-2xl font-bold">Referral program</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reward your buyers for bringing friends. When a new buyer completes their first paid
          checkout via a referrer&apos;s link, both sides get an auto-issued discount code. Refunds
          within the reward window claw back unused codes automatically.
        </p>
      </header>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">{success}</div>}

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      {stats && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Links issued" value={stats.totalLinks.toLocaleString('en-US')} icon={Users} />
          <StatCard label="Clicks" value={stats.totalClicks.toLocaleString('en-US')} icon={MousePointerClick} />
          <StatCard label="Rewards issued" value={stats.totalRewards.toLocaleString('en-US')} icon={Gift} />
          <StatCard label="Attributed revenue" value={stats.attributedRevenue > 0 ? fmt(stats.attributedRevenue) : '—'} icon={DollarSign} />
        </section>
      )}
      {stats && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          Conversion rate (rewards / clicks): <span className="font-semibold text-foreground">{fmtPct(stats.conversionRate)}</span>
        </div>
      )}

      {/* ── Config ────────────────────────────────────────────────────────── */}
      <Card className="space-y-4 p-5">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Enable referral program</div>
            <p className="text-xs text-muted-foreground">
              When off, new buyers aren&apos;t attributed and no rewards issue. Existing reward codes
              remain redeemable.
            </p>
          </div>
          <Switch
            checked={form.enabled}
            onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
          />
        </label>

        <div>
          <Label htmlFor="rewardType" className="mb-1 block text-xs font-medium">Reward type</Label>
          <Select
            value={form.rewardType}
            onValueChange={(v) => setForm({ ...form, rewardType: v as ReferralProgramConfig['rewardType'] })}
          >
            <SelectTrigger id="rewardType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Percent off cart</SelectItem>
              <SelectItem value="fixed">Fixed amount off cart</SelectItem>
              <SelectItem value="shipping_percent">Percent off shipping</SelectItem>
              <SelectItem value="shipping_fixed">Fixed amount off shipping</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="referrerValue" className="mb-1 block text-xs font-medium">
              Referrer reward {isPercent ? '(1–100)' : '(smallest currency unit)'}
            </Label>
            <Input
              id="referrerValue"
              type="number"
              value={form.referrerValue}
              onChange={(e) => setForm({ ...form, referrerValue: parseInt(e.target.value, 10) || 0 })}
              min={1}
              max={isPercent ? 100 : undefined}
            />
          </div>
          <div>
            <Label htmlFor="refereeValue" className="mb-1 block text-xs font-medium">
              Referee (new buyer) reward {isPercent ? '(1–100)' : '(smallest currency unit)'}
            </Label>
            <Input
              id="refereeValue"
              type="number"
              value={form.refereeValue}
              onChange={(e) => setForm({ ...form, refereeValue: parseInt(e.target.value, 10) || 0 })}
              min={1}
              max={isPercent ? 100 : undefined}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Tip: a slightly bigger pull for new buyers (the referee) typically converts better.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="currency" className="mb-1 block text-xs font-medium">Currency</Label>
            <Input
              id="currency"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              maxLength={8}
              className="uppercase"
            />
          </div>
          <div>
            <Label htmlFor="minPurchase" className="mb-1 block text-xs font-medium">Minimum purchase (smallest unit, optional)</Label>
            <Input
              id="minPurchase"
              type="number"
              value={form.minPurchaseAmount ?? ''}
              onChange={(e) => setForm({ ...form, minPurchaseAmount: e.target.value ? parseInt(e.target.value, 10) : null })}
              placeholder="None"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="rewardExpiryDays" className="mb-1 block text-xs font-medium">Reward code expires after</Label>
            <Select
              value={String(form.rewardExpiryDays)}
              onValueChange={(v) => setForm({ ...form, rewardExpiryDays: parseInt(v, 10) })}
            >
              <SelectTrigger id="rewardExpiryDays">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[30, 60, 90, 120, 180, 365].map((d) => (
                  <SelectItem key={d} value={String(d)}>{d} days</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="attributionWindowDays" className="mb-1 block text-xs font-medium">Attribution window</Label>
            <Select
              value={String(form.attributionWindowDays)}
              onValueChange={(v) => setForm({ ...form, attributionWindowDays: parseInt(v, 10) })}
            >
              <SelectTrigger id="attributionWindowDays">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[7, 14, 30, 60, 90, 180].map((d) => (
                  <SelectItem key={d} value={String(d)}>{d} days</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              How long after clicking a link the buyer has to convert for the referrer to earn.
            </p>
          </div>
          <div>
            <Label htmlFor="maxRewards" className="mb-1 block text-xs font-medium">Max rewards per referrer (optional)</Label>
            <Input
              id="maxRewards"
              type="number"
              value={form.maxRewardsPerReferrer ?? ''}
              onChange={(e) => setForm({ ...form, maxRewardsPerReferrer: e.target.value ? parseInt(e.target.value, 10) : null })}
              placeholder="Unlimited"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="programTerms" className="mb-1 block text-xs font-medium">Program terms (optional, shown on buyer refer page)</Label>
          <Textarea
            id="programTerms"
            value={form.programTerms ?? ''}
            onChange={(e) => setForm({ ...form, programTerms: e.target.value || null })}
            rows={3}
            maxLength={10000}
            placeholder="e.g. Rewards are single-use per code. Not combinable with other promotions. Valid for your first paid order only."
          />
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
          Top referrers <span className="ml-1 text-xs font-normal text-muted-foreground">(last 20)</span>
        </header>
        {links.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No referral links yet. Once enabled, every signed-in buyer gets a unique link they can share.
          </Card>
        ) : (
          <DataTable
            rows={links}
            columns={[
              {
                key: 'buyer',
                header: 'Buyer',
                sortable: true,
                sortValue: (l) => l.customer?.email ?? '',
                searchValue: (l) => `${l.customer?.email ?? ''} ${l.code}`,
                cell: (l) => <span className="font-mono text-xs">{l.customer?.email ?? '—'}</span>,
              },
              {
                key: 'code',
                header: 'Code',
                sortable: true,
                sortValue: (l) => l.code,
                cell: (l) => <span className="font-mono text-xs">{l.code}</span>,
              },
              {
                key: 'clicks',
                header: 'Clicks',
                align: 'right',
                sortable: true,
                sortValue: (l) => l.clicks,
                cell: (l) => l.clicks.toLocaleString('en-US'),
              },
              {
                key: 'signups',
                header: 'Signups',
                align: 'right',
                sortable: true,
                sortValue: (l) => l.signups,
                cell: (l) => l.signups.toLocaleString('en-US'),
              },
              {
                key: 'rewards',
                header: 'Rewards',
                align: 'right',
                sortable: true,
                sortValue: (l) => l.rewards,
                cell: (l) => l.rewards.toLocaleString('en-US'),
              },
              {
                key: 'revenue',
                header: 'Revenue',
                align: 'right',
                sortable: true,
                sortValue: (l) => l.revenue,
                cell: (l) => (
                  <span className="font-mono text-xs">{l.revenue > 0 ? fmt(l.revenue) : '—'}</span>
                ),
              },
            ] as Column<ReferralLinkRow>[]}
            rowKey={(l) => l.id}
            searchPlaceholder="Search buyer, code…"
            defaultSort={{ key: 'revenue', dir: 'desc' }}
            empty="No referrers match."
          />
        )}
      </section>

      <section>
        <header className="mb-2 text-sm font-semibold">
          Recent attributions <span className="ml-1 text-xs font-normal text-muted-foreground">(last 20)</span>
        </header>
        {attributions.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Attributions appear here once new buyers sign up via a referral link.
          </Card>
        ) : (
          <DataTable
            rows={attributions}
            columns={[
              {
                key: 'clicked',
                header: 'Clicked',
                sortable: true,
                sortValue: (a) => new Date(a.clickedAt).getTime(),
                searchValue: (a) => `${a.referrerCustomer?.email ?? ''} ${a.refereeCustomer?.email ?? ''} ${a.link?.code ?? ''}`,
                cell: (a) => <span className="text-xs text-muted-foreground">{relativeTime(a.clickedAt)}</span>,
              },
              {
                key: 'referrer',
                header: 'Referrer',
                sortable: true,
                sortValue: (a) => a.referrerCustomer?.email ?? '',
                cell: (a) => <span className="font-mono text-xs">{a.referrerCustomer?.email ?? '—'}</span>,
              },
              {
                key: 'referee',
                header: 'Referee (new buyer)',
                sortable: true,
                sortValue: (a) => a.refereeCustomer?.email ?? '',
                cell: (a) => <span className="font-mono text-xs">{a.refereeCustomer?.email ?? '—'}</span>,
              },
              {
                key: 'code',
                header: 'Code',
                sortable: true,
                sortValue: (a) => a.link?.code ?? '',
                cell: (a) => <span className="font-mono text-xs">{a.link?.code ?? '—'}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                sortable: true,
                sortValue: (a) => a.status,
                cell: (a) => <StatusPill status={a.status} reason={a.voidReason} />,
              },
            ] as Column<ReferralAttributionRow>[]}
            rowKey={(a) => a.id}
            searchPlaceholder="Search email, code…"
            defaultSort={{ key: 'clicked', dir: 'desc' }}
            empty="No attributions match."
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

function StatusPill({ status, reason }: { status: string; reason: string | null }) {
  const base = 'gap-1 rounded-full border-transparent px-2 py-0.5 text-[11px] font-medium';
  if (status === 'rewarded') {
    return <Badge variant="outline" className={`${base} bg-green-100 text-green-900`}>Rewarded</Badge>;
  }
  if (status === 'pending') {
    return <Badge variant="outline" className={`${base} bg-amber-100 text-amber-900`}>Pending</Badge>;
  }
  if (status === 'expired') {
    return <Badge variant="outline" className={`${base} bg-muted text-muted-foreground`}>Expired</Badge>;
  }
  return (
    <Badge variant="outline" className={`${base} bg-red-100 text-red-900`} title={reason ?? undefined}>
      Voided{reason ? ` · ${reason}` : ''}
    </Badge>
  );
}

function extractError(e: unknown): string | null {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? null;
}
