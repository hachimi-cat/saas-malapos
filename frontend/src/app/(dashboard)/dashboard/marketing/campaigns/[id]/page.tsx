'use client';

/*
 * Marketing Campaign HUB — detail view.
 *
 * GET ripllo /api/v1/marketing-campaigns/:id for the campaign + counts
 * of each linked child kind. We render counts + a quick "Open in
 * Ripllo" deep-link for the full performance roll-up (which lives in
 * the ripllo portal — too heavy to mirror inside storlaunch).
 *
 * Editing the campaign (status, budget, dates, description) happens
 * inline via PATCH. Child-attach editors stay in ripllo — storlaunch
 * surfaces what's linked without re-implementing the attach flows.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Megaphone, Loader2, ExternalLink, Save } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button, ErrorBox } from '@/components/dashboard/ui';
import { BackLink } from '@/components/dashboard/back-link';
import { marketingFetch } from '@/lib/marketing-api';

type Goal = 'awareness' | 'conversion' | 'retention' | 'launch' | 'other';
type Status = 'draft' | 'live' | 'paused' | 'completed' | 'archived';

interface CampaignCounts {
  creatorBriefs: number;
  affiliatePrograms: number;
  discountCodes: number;
  cartReminders: number;
  referralPrograms: number;
  blogPosts: number;
  feeds: number;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  goal: Goal;
  status: Status;
  budgetIdr: number | null;
  startsAt: string | null;
  endsAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: CampaignCounts;
}

const RIPLLO_BASE = process.env.NEXT_PUBLIC_RIPLLO_BASE ?? 'https://ripllo.com';

const GOAL_LABELS: Record<Goal, string> = {
  awareness: 'Awareness',
  conversion: 'Conversion',
  retention: 'Retention',
  launch: 'Launch',
  other: 'Other',
};
const STATUS_LABELS: Record<Status, string> = {
  draft: 'Draft',
  live: 'Live',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived',
};

export default function MarketingCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ status: Status; goal: Goal; budgetIdr: string; description: string }>({
    status: 'draft',
    goal: 'awareness',
    budgetIdr: '',
    description: '',
  });

  async function load() {
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/marketing-campaigns/${id}`, {
        credentials: 'include',
      });
      const b = await r.json();
      if (!r.ok) {
        setError(b?.error?.message ?? 'failed to load');
        return;
      }
      setCampaign(b?.data ?? null);
      setForm({
        status: b?.data?.status ?? 'draft',
        goal: b?.data?.goal ?? 'awareness',
        budgetIdr: b?.data?.budgetIdr != null ? String(b.data.budgetIdr) : '',
        description: b?.data?.description ?? '',
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (id) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        status: form.status,
        goal: form.goal,
        description: form.description.trim() || null,
      };
      if (form.budgetIdr === '') body.budgetIdr = null;
      else body.budgetIdr = Number(form.budgetIdr);
      const r = await marketingFetch(`/api/v1/account/marketing/marketing-campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const b = await r.json();
      if (!r.ok) {
        setError(b?.error?.message ?? 'save failed');
        return;
      }
      setEditing(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!campaign) {
    return (
      <div className="mx-auto max-w-6xl">
        <BackLink href="/dashboard/marketing/campaigns" label="All campaigns" />
        {error ? <ErrorBox>{error}</ErrorBox> : <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      </div>
    );
  }

  const counts = campaign._count;
  const totalChildren = counts
    ? counts.creatorBriefs + counts.affiliatePrograms + counts.discountCodes + counts.cartReminders + counts.referralPrograms + counts.blogPosts + counts.feeds
    : 0;

  return (
    <div>
      <BackLink href="/dashboard/marketing/campaigns" label="All campaigns" />
      <PageHeader
        icon={Megaphone}
        title={campaign.name}
        description={`${STATUS_LABELS[campaign.status] ?? campaign.status} · ${GOAL_LABELS[campaign.goal] ?? campaign.goal}${campaign.budgetIdr ? ` · Rp ${campaign.budgetIdr.toLocaleString()} budget` : ''}`}
        action={
          <>
            <a
              href={`${RIPLLO_BASE}/dashboard/campaigns/${campaign.id}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <ExternalLink size={14} /> Open in Ripllo
            </a>
            <Button onClick={() => setEditing((v) => !v)}>{editing ? 'Cancel' : 'Edit'}</Button>
          </>
        }
      />

      {error && <ErrorBox>{error}</ErrorBox>}

      {editing ? (
        <section className="mb-6 rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Goal">
              <select value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value as Goal })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                {Object.entries(GOAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="Budget (IDR)">
            <input type="number" min="0" value={form.budgetIdr} onChange={(e) => setForm({ ...form, budgetIdr: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Leave blank to clear" />
          </Field>
          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-brand-600 disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save size={14} />}
              Save
            </button>
          </div>
        </section>
      ) : (
        campaign.description && (
          <section className="mb-6 rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight mb-2">About</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{campaign.description}</p>
          </section>
        )
      )}

      <h2 className="text-sm font-semibold tracking-tight mb-3 mt-8">Linked items ({totalChildren})</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ChildCard label="Creator briefs" count={counts?.creatorBriefs ?? 0} href="/dashboard/marketing/creator-briefs" />
        <ChildCard label="Affiliate programs" count={counts?.affiliatePrograms ?? 0} href="/dashboard/marketing/programs" />
        <ChildCard label="Discount codes" count={counts?.discountCodes ?? 0} href="/dashboard/marketing/discount-codes" />
        <ChildCard label="Cart reminders" count={counts?.cartReminders ?? 0} href="/dashboard/marketing/abandoned-cart" />
        <ChildCard label="Referral programs" count={counts?.referralPrograms ?? 0} href="/dashboard/marketing/referrals" />
        <ChildCard label="Blog posts" count={counts?.blogPosts ?? 0} href="/dashboard/marketing/blog" />
        <ChildCard label="Product feeds" count={counts?.feeds ?? 0} href="/dashboard/marketing/feeds" />
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Linked items roll up performance in Ripllo. To attach a creator brief, discount, broadcast, or other child to this campaign,{' '}
        <a href={`${RIPLLO_BASE}/dashboard/campaigns/${campaign.id}`} target="_blank" rel="noopener" className="text-brand-500 hover:underline">open this campaign in Ripllo</a>.
      </p>
    </div>
  );
}

function ChildCard({ label, count, href }: { label: string; count: number; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-border bg-card p-4 hover:bg-secondary/30 transition">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{count}</div>
    </Link>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
