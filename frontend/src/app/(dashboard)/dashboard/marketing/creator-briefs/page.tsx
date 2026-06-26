'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Megaphone, Lock, Plus, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button, ErrorBox } from '@/components/dashboard/ui';
import { marketingFetch } from '@/lib/marketing-api';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';

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
    <div className="mx-auto max-w-6xl">
      <PageHeader
        icon={Megaphone}
        title="Creator briefs"
        description="Brief paid creator collabs. Public + invite-only. Optionally link a brief to a parent Campaign for roll-up reporting."
        action={enabled ? <Button onClick={() => setShowForm(true)}><Plus size={14} /> New brief</Button> : undefined}
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
        <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          No creator briefs yet.
        </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setShowForm(false)}>
          <form onSubmit={create} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-card p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">New creator brief</h2>
            <Field label="Name">
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </Field>
            <Field label="Brief (what creators need to do)">
              <textarea rows={4} required value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Budget (IDR)">
                <input type="number" min="0" value={form.budgetIdr} onChange={(e) => setForm({ ...form, budgetIdr: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="Discovery">
                <select value={form.discoveryMode} onChange={(e) => setForm({ ...form, discoveryMode: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <option value="public">Public — anyone applies</option>
                  <option value="invite_only">Invite only</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Pricing model">
                <select value={form.pricingModel} onChange={(e) => setForm({ ...form, pricingModel: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <option value="flat">Flat fee</option>
                  <option value="cpm">CPM</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </Field>
              <Field label="Ripllo platform fee (%)">
                <input type="number" min="0" max="50" step="0.5" value={form.platformFeeRate} onChange={(e) => setForm({ ...form, platformFeeRate: Number(e.target.value) })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </Field>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-md border border-border py-2 text-sm">Cancel</button>
              <button type="submit" disabled={working} className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-brand-600 disabled:opacity-60">
                {working ? 'Creating…' : 'Create brief'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
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
