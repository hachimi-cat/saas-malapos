'use client';

/*
 * Marketing Campaign HUB — list view.
 *
 * Ripllo 0.3.0 introduced the central `MarketingCampaign` resource at
 * /api/v1/marketing-campaigns (proxied here as
 * /api/v1/account/marketing/marketing-campaigns). A Campaign is the
 * umbrella that ties creator briefs, affiliate programs, discount
 * codes, abandoned-cart reminders, referral programs, blog posts,
 * product feeds, and broadcasts together for one merchant push (e.g.
 * "Q4 holiday launch"). Each child entity remains usable standalone.
 *
 * Storlaunch's marketing module is a thin host on top of ripllo —
 * this page is List + Create only; the per-campaign detail page
 * (`./[id]/page.tsx`) does GET + GET /full + child counts. Full
 * performance roll-up + child-attach editors live in the ripllo
 * portal itself (deep-link via "Open in Ripllo").
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Megaphone, Loader2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { ErrorBox } from '@/components/dashboard/ui';
import { marketingFetch } from '@/lib/marketing-api';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
  _count?: CampaignCounts;
}

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

export default function MarketingCampaignsHubPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [working, setWorking] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    goal: 'awareness' as Goal,
    status: 'draft' as Status,
    budgetIdr: '',
    startsAt: '',
    endsAt: '',
  });

  async function load() {
    try {
      const r = await marketingFetch('/api/v1/account/marketing/marketing-campaigns', {
        credentials: 'include',
      });
      const b = await r.json();
      if (!r.ok) {
        setError(b?.error?.message ?? 'failed to load');
        setCampaigns([]);
        return;
      }
      setCampaigns(b?.data?.campaigns ?? []);
    } catch (e) {
      setError((e as Error).message);
      setCampaigns([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        goal: form.goal,
        status: form.status,
      };
      if (form.description.trim()) body.description = form.description.trim();
      if (form.budgetIdr) body.budgetIdr = Number(form.budgetIdr);
      if (form.startsAt) body.startsAt = new Date(form.startsAt).toISOString();
      if (form.endsAt) body.endsAt = new Date(form.endsAt).toISOString();
      const r = await marketingFetch('/api/v1/account/marketing/marketing-campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const b = await r.json();
      if (!r.ok) {
        setError(b?.error?.message ?? 'create failed');
        return;
      }
      setShowForm(false);
      setForm({ ...form, name: '', description: '', budgetIdr: '', startsAt: '', endsAt: '' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  function totalChildren(c: Campaign): number {
    if (!c._count) return 0;
    return (
      c._count.creatorBriefs +
      c._count.affiliatePrograms +
      c._count.discountCodes +
      c._count.cartReminders +
      c._count.referralPrograms +
      c._count.blogPosts +
      c._count.feeds
    );
  }

  return (
    <div>
      <PageHeader
        icon={Megaphone}
        title="Campaigns"
        description="Group creator briefs, discounts, broadcasts and more under one push. Each child still works standalone."
        action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> New campaign</Button>}
      />

      {error && <ErrorBox>{error}</ErrorBox>}

      {campaigns === null ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : campaigns.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          No campaigns yet. Create one to bundle several marketing moves under a shared goal + date range.
        </Card>
      ) : (
        <DataTable
          rows={campaigns}
          rowKey={(c) => c.id}
          searchPlaceholder="Search name, description…"
          defaultSort={{ key: 'name', dir: 'asc' }}
          empty="No campaigns match."
          columns={[
            {
              key: 'name',
              header: 'Name',
              cell: (c) => (
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  {c.description && <div className="text-xs text-muted-foreground truncate">{c.description}</div>}
                </div>
              ),
            },
            { key: 'goal', header: 'Goal', cell: (c) => <span className="text-xs">{GOAL_LABELS[c.goal] ?? c.goal}</span> },
            { key: 'status', header: 'Status', cell: (c) => <span className="text-xs capitalize">{STATUS_LABELS[c.status] ?? c.status}</span> },
            {
              key: 'children',
              header: 'Linked items',
              align: 'right',
              cell: (c) => <span className="font-mono text-xs">{totalChildren(c)}</span>,
            },
            {
              key: 'budget',
              header: 'Budget',
              align: 'right',
              cell: (c) => <span className="font-mono text-xs">{c.budgetIdr ? `Rp ${c.budgetIdr.toLocaleString()}` : '—'}</span>,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              cell: (c) => (
                <Link href={`/dashboard/marketing/campaigns/${c.id}`} className="text-brand-500 hover:underline text-xs">
                  Open
                </Link>
              ),
            },
          ] as Column<Campaign>[]}
          filters={[
            {
              key: 'status',
              label: 'Status',
              accessor: (c) => c.status,
              options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
            },
            {
              key: 'goal',
              label: 'Goal',
              accessor: (c) => c.goal,
              options: Object.entries(GOAL_LABELS).map(([value, label]) => ({ value, label })),
            },
          ] as FilterDef<Campaign>[]}
        />
      )}

      {showForm && (
        <Dialog open onOpenChange={(o) => !o && setShowForm(false)}>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New campaign</DialogTitle>
            </DialogHeader>
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="campaign-name">Name</Label>
                <Input id="campaign-name" type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Q4 holiday launch" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campaign-description">Description</Label>
                <Textarea id="campaign-description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-goal">Goal</Label>
                  <Select value={form.goal} onValueChange={(v) => setForm({ ...form, goal: v as Goal })}>
                    <SelectTrigger id="campaign-goal"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(GOAL_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-status">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                    <SelectTrigger id="campaign-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campaign-budget">Budget (IDR, optional)</Label>
                <Input id="campaign-budget" type="number" min="0" value={form.budgetIdr} onChange={(e) => setForm({ ...form, budgetIdr: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-starts">Starts</Label>
                  <Input id="campaign-starts" type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-ends">Ends</Label>
                  <Input id="campaign-ends" type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
                <Button type="submit" disabled={working} className="flex-1">
                  {working ? 'Creating…' : 'Create campaign'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
