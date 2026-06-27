'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Megaphone, Lock, Plus, Loader2 } from 'lucide-react';
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
  DialogFooter,
} from '@/components/ui/dialog';

interface PlanInfo { plan: string; isForjioInternal: boolean }

interface Campaign {
  id: string;
  name: string;
  brief: string;
  budgetIdr: number;
  status: 'draft' | 'open' | 'closed' | 'archived';
  discoveryMode: 'public' | 'invite_only';
  pricingModel: 'flat' | 'cpm' | 'hybrid';
  platformFeeRate: number;
  createdAt: string;
  _count?: { invitations: number; applications: number };
}

export default function CampaignsPage() {
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [working, setWorking] = useState(false);
  const [form, setForm] = useState({
    name: '', brief: '', budgetIdr: '', pricingModel: 'flat',
    discoveryMode: 'public', platformFeeRate: 15,
  });

  async function load() {
    try {
      const [p, c] = await Promise.all([
        marketingFetch('/api/v1/account/marketing/billing/plan', { credentials: 'include' }).then((r) => r.json()),
        marketingFetch('/api/v1/account/marketing/campaigns', { credentials: 'include' }).then((r) => r.json()),
      ]);
      setPlan(p?.data ?? null);
      setCampaigns(c?.data?.campaigns ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const r = await marketingFetch('/api/v1/account/marketing/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: form.name,
          brief: form.brief,
          budgetIdr: form.budgetIdr ? Number(form.budgetIdr) : 0,
          pricingModel: form.pricingModel,
          status: 'open',
          discoveryMode: form.discoveryMode,
          platformFeeRate: form.platformFeeRate / 100,
          deliverables: [],
        }),
      });
      const b = await r.json();
      if (!r.ok) {
        setError(b?.error?.message ?? 'create failed');
        return;
      }
      setShowForm(false);
      setForm({ ...form, name: '', brief: '', budgetIdr: '' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const enabled = plan?.isForjioInternal || plan?.plan === 'growth' || plan?.plan === 'scale';

  return (
    <div>
      <PageHeader
        icon={Megaphone}
        title="Creator briefs"
        description="Brief paid creator collabs. Public + invite-only. Optionally link a brief to a parent Campaign for roll-up reporting."
        action={enabled ? <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> New brief</Button> : undefined}
      />

      {error && <ErrorBox>{error}</ErrorBox>}

      {!enabled ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-6">
          <Lock className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold">Available on Growth + Scale plans</p>
            <p className="mt-1 text-muted-foreground">
              <Link href="/dashboard/billing" className="text-brand-500 hover:underline">Upgrade to unlock →</Link>
            </p>
          </div>
        </div>
      ) : campaigns === null ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : campaigns.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          No creator briefs yet.
        </Card>
      ) : (
        <DataTable
          rows={campaigns}
          columns={[
            {
              key: 'name',
              header: 'Name',
              sortable: true,
              sortValue: (c) => c.name,
              searchValue: (c) => `${c.name} ${c.brief}`,
              cell: (c) => <span className="font-medium">{c.name}</span>,
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              sortValue: (c) => c.status,
              cell: (c) => <span className="capitalize">{c.status}</span>,
            },
            {
              key: 'discovery',
              header: 'Discovery',
              sortable: true,
              sortValue: (c) => c.discoveryMode,
              cell: (c) => <span className="text-xs">{c.discoveryMode.replace('_', ' ')}</span>,
            },
            {
              key: 'budget',
              header: 'Budget',
              align: 'right',
              sortable: true,
              sortValue: (c) => c.budgetIdr,
              cell: (c) => <span className="font-mono">Rp {c.budgetIdr.toLocaleString()}</span>,
            },
            {
              key: 'apps',
              header: 'Apps · Invs',
              align: 'right',
              sortable: true,
              sortValue: (c) => (c._count?.applications ?? 0) + (c._count?.invitations ?? 0),
              cell: (c) => (
                <span className="font-mono text-xs">
                  {c._count?.applications ?? 0} · {c._count?.invitations ?? 0}
                </span>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              cell: (c) => (
                <Link href={`/dashboard/marketing/creator-briefs/${c.id}`} className="text-brand-500 hover:underline text-xs">
                  Manage
                </Link>
              ),
            },
          ] as Column<Campaign>[]}
          filters={[
            {
              key: 'status',
              label: 'Status',
              accessor: (c) => c.status,
              options: [
                { value: 'draft', label: 'Draft' },
                { value: 'open', label: 'Open' },
                { value: 'closed', label: 'Closed' },
                { value: 'archived', label: 'Archived' },
              ],
            },
          ] as FilterDef<Campaign>[]}
          rowKey={(c) => c.id}
          searchPlaceholder="Search name, brief…"
          defaultSort={{ key: 'name', dir: 'asc' }}
          empty="No briefs match."
        />
      )}

      {showForm && (
        <Dialog open onOpenChange={(o) => !o && setShowForm(false)}>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New creator brief</DialogTitle>
            </DialogHeader>
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="brief-name">Name</Label>
                <Input id="brief-name" type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brief-brief">Brief (what creators need to do)</Label>
                <Textarea id="brief-brief" rows={4} required value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="brief-budget">Budget (IDR)</Label>
                  <Input id="brief-budget" type="number" min="0" value={form.budgetIdr} onChange={(e) => setForm({ ...form, budgetIdr: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="brief-discovery">Discovery</Label>
                  <Select value={form.discoveryMode} onValueChange={(v) => setForm({ ...form, discoveryMode: v })}>
                    <SelectTrigger id="brief-discovery">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public — anyone applies</SelectItem>
                      <SelectItem value="invite_only">Invite only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="brief-pricing">Pricing model</Label>
                  <Select value={form.pricingModel} onValueChange={(v) => setForm({ ...form, pricingModel: v })}>
                    <SelectTrigger id="brief-pricing">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat">Flat fee</SelectItem>
                      <SelectItem value="cpm">CPM</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="brief-fee">Ripllo platform fee (%)</Label>
                  <Input id="brief-fee" type="number" min="0" max="50" step="0.5" value={form.platformFeeRate} onChange={(e) => setForm({ ...form, platformFeeRate: Number(e.target.value) })} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" disabled={working}>
                  {working ? 'Creating…' : 'Create brief'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
