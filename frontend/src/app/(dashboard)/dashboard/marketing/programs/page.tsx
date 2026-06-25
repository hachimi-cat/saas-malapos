'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Handshake, Lock, Plus, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button, ErrorBox } from '@/components/dashboard/ui';
import { marketingFetch } from '@/lib/marketing-api';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';
import { CampaignSelect } from '@/components/marketing/campaign-select';

interface PlanInfo { plan: string; isForjioInternal: boolean }

interface Program {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'open' | 'paused' | 'closed';
  commissionModel: 'perf_redemption' | 'perf_sale' | 'tiered';
  commissionRate: number;
  cookieDays: number;
  autoApprove: boolean;
  platformFeeRate: number;
  createdAt: string;
  _count?: { enrollments: number };
}

export default function ProgramsPage() {
  // Deep-link pre-fill: /dashboard/marketing/programs?campaign=<id>
  // auto-opens the create modal with the campaign pre-selected. Used by
  // the campaign hub's "Add program to this campaign" CTA.
  const searchParams = useSearchParams();
  const campaignParam = searchParams?.get('campaign') ?? null;
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [working, setWorking] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', targetUrl: '', commissionModel: 'perf_redemption', commissionRate: 10,
    cookieDays: 30, autoApprove: true, minFollowerCount: '', requiresKyc: true, platformFeeRate: 10,
    marketingCampaignId: campaignParam as string | null,
  });

  // Auto-open create modal when arriving with ?campaign=<id>.
  useEffect(() => {
    if (campaignParam) setShowForm(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignParam]);

  async function load() {
    try {
      const [p, pr] = await Promise.all([
        marketingFetch('/api/v1/account/marketing/billing/plan', { credentials: 'include' }).then((r) => r.json()),
        marketingFetch('/api/v1/account/marketing/programs', { credentials: 'include' }).then((r) => r.json()),
      ]);
      setPlan(p?.data ?? null);
      setPrograms(pr?.data?.programs ?? []);
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
      const r = await marketingFetch('/api/v1/account/marketing/programs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          targetUrl: form.targetUrl || null,
          commissionModel: form.commissionModel,
          commissionRate: form.commissionRate / 100,
          cookieDays: form.cookieDays,
          status: 'open',
          autoApprove: form.autoApprove,
          minFollowerCount: form.minFollowerCount ? Number(form.minFollowerCount) : null,
          requiresKyc: form.requiresKyc,
          platformFeeRate: form.platformFeeRate / 100,
          // Explicit null on detach so ripllo clears the FK.
          marketingCampaignId: form.marketingCampaignId,
        }),
      });
      const b = await r.json();
      if (!r.ok) {
        setError(b?.error?.message ?? 'create failed');
        return;
      }
      setShowForm(false);
      setForm({ ...form, name: '', description: '' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const enabled = plan?.isForjioInternal || plan?.plan === 'starter' || plan?.plan === 'growth' || plan?.plan === 'scale';

  return (
    <div>
      <PageHeader
        icon={Handshake}
        title="Affiliate Programs"
        description="Self-serve commission-only programs. Auto-mint discount + referral attribution per affiliator."
        action={enabled ? <Button onClick={() => setShowForm(true)}><Plus size={14} /> New program</Button> : undefined}
      />

      {error && <ErrorBox>{error}</ErrorBox>}

      {!enabled ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-6">
          <Lock className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold">Available on Starter and above</p>
            <p className="mt-1 text-muted-foreground">
              <Link href="/dashboard/billing" className="text-brand-500 hover:underline">Upgrade to unlock →</Link>
            </p>
          </div>
        </div>
      ) : programs === null ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : programs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          No programs yet. Create your first to start enrolling affiliators.
        </div>
      ) : (
        <DataTable
          rows={programs}
          columns={[
            {
              key: 'name',
              header: 'Name',
              sortable: true,
              sortValue: (p) => p.name,
              searchValue: (p) => `${p.name} ${p.description ?? ''}`,
              cell: (p) => <span className="font-medium">{p.name}</span>,
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              sortValue: (p) => p.status,
              cell: (p) => <span className="capitalize">{p.status}</span>,
            },
            {
              key: 'model',
              header: 'Model',
              sortable: true,
              sortValue: (p) => p.commissionModel,
              cell: (p) => <span className="text-xs">{p.commissionModel.replace(/_/g, ' ')}</span>,
            },
            {
              key: 'rate',
              header: 'Rate',
              align: 'right',
              sortable: true,
              sortValue: (p) => p.commissionRate,
              cell: (p) => <span className="font-mono">{(p.commissionRate * 100).toFixed(1)}%</span>,
            },
            {
              key: 'cookie',
              header: 'Cookie',
              align: 'right',
              sortable: true,
              sortValue: (p) => p.cookieDays,
              cell: (p) => <span className="font-mono">{p.cookieDays}d</span>,
            },
            {
              key: 'affiliators',
              header: 'Affiliators',
              align: 'right',
              sortable: true,
              sortValue: (p) => p._count?.enrollments ?? 0,
              cell: (p) => <span className="font-mono">{p._count?.enrollments ?? 0}</span>,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              cell: (p) => (
                <Link href={`/dashboard/marketing/programs/${p.id}`} className="text-brand-500 hover:underline text-xs">
                  Manage
                </Link>
              ),
            },
          ] as Column<Program>[]}
          filters={[
            {
              key: 'status',
              label: 'Status',
              accessor: (p) => p.status,
              options: [
                { value: 'draft', label: 'Draft' },
                { value: 'open', label: 'Open' },
                { value: 'paused', label: 'Paused' },
                { value: 'closed', label: 'Closed' },
              ],
            },
          ] as FilterDef<Program>[]}
          rowKey={(p) => p.id}
          searchPlaceholder="Search name, description…"
          defaultSort={{ key: 'name', dir: 'asc' }}
          empty="No programs match."
        />
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setShowForm(false)}>
          <form onSubmit={create} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-card p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">New program</h2>
            <Field label="Name">
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </Field>
            <Field label="Description">
              <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </Field>
            <Field label="Storefront URL (where buyers land)">
              <input
                type="url"
                placeholder="https://yourstore.storlaunch.com/"
                value={form.targetUrl}
                onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">Affiliator share links redirect here with <span className="font-mono">?code=&lt;promo&gt;</span> appended.</p>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Commission model">
                <select value={form.commissionModel} onChange={(e) => setForm({ ...form, commissionModel: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <option value="perf_redemption">Per redemption</option>
                  <option value="perf_sale">Per sale (% of GMV)</option>
                </select>
              </Field>
              <Field label="Commission rate (%)">
                <input type="number" min="0" max="100" step="0.5" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: Number(e.target.value) })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cookie days">
                <input type="number" min="1" max="365" value={form.cookieDays} onChange={(e) => setForm({ ...form, cookieDays: Number(e.target.value) })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="Min follower count">
                <input type="number" min="0" value={form.minFollowerCount} onChange={(e) => setForm({ ...form, minFollowerCount: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="No floor" />
              </Field>
            </div>
            <Field label="Ripllo platform fee (%)">
              <input type="number" min="0" max="50" step="0.5" value={form.platformFeeRate} onChange={(e) => setForm({ ...form, platformFeeRate: Number(e.target.value) })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </Field>
            <CampaignSelect
              value={form.marketingCampaignId}
              onChange={(id) => setForm({ ...form, marketingCampaignId: id })}
              disabled={working}
            />
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.autoApprove} onChange={(e) => setForm({ ...form, autoApprove: e.target.checked })} />
                Auto-approve enrollments
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.requiresKyc} onChange={(e) => setForm({ ...form, requiresKyc: e.target.checked })} />
                Require KYC
              </label>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-md border border-border py-2 text-sm">Cancel</button>
              <button type="submit" disabled={working} className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-brand-600 disabled:opacity-60">
                {working ? 'Creating…' : 'Create program'}
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
