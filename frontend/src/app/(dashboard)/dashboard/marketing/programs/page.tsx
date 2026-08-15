'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Lock, Plus, Loader2, Pencil, Trash2} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { AgenticEntry, BulkEditSlot, BulkVerbSlot } from '@/components/catentio/agentic-entry';
import { ActionsDropdown, type PageAction } from '@/components/dashboard/actions-dropdown';
import { BulkBar } from '@/components/dashboard/bulk-bar';
import { useCatentioStatus } from '@/hooks/use-catentio';
import { ErrorBox } from '@/components/dashboard/ui';
import { marketingFetch } from '@/lib/marketing-api';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';
import { CampaignSelect } from '@/components/marketing/campaign-select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
  const [selection, setSelection] = useState<Program[]>([]);
  const [bulkEditTargets, setBulkEditTargets] = useState<Program[] | null>(null);
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<Program[] | null>(null);
  const { enabled: assistantEnabled } = useCatentioStatus();
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

  // Both halves of every verb: single at the row, batch here.
  const pageActions: PageAction[] = assistantEnabled
    ? [
        {
          key: 'bulk-edit',
          label: selection.length > 0 ? `Bulk edit ${selection.length} selected` : 'Bulk edit',
          icon: Pencil,
          run: () => setBulkEditTargets(selection),
          requiresSelection: true,
        },
        {
          key: 'bulk-delete',
          label: selection.length > 0 ? `Delete ${selection.length} selected` : 'Delete selected',
          icon: Trash2,
          run: () => setBulkDeleteTargets(selection),
          requiresSelection: true,
          destructive: true,
        },
      ]
    : [];

  const enabled = plan?.isForjioInternal || plan?.plan === 'starter' || plan?.plan === 'growth' || plan?.plan === 'scale';

  return (
    <div>
      <PageHeader
        title="Affiliate Programs"
        description="Self-serve commission-only programs. Auto-mint discount + referral attribution per affiliator."
        action={
          enabled ? (
            <>
              <ActionsDropdown
                actions={pageActions}
                selectionCount={selection.length}
                noun="affiliate program"
              />
              <AgenticEntry
                resource="programs"
                mode="create"
                onApplied={load}
                className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                fallback={<Button onClick={() => setShowForm(true)}><Plus size={14} /> New program</Button>}
              >
                <Plus className="h-4 w-4" /> New program
              </AgenticEntry>
            </>
          ) : undefined
        }
      />

      {error && <ErrorBox>{error}</ErrorBox>}

      {!enabled ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-6">
          <Lock className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold">Available on Starter and above</p>
            <p className="mt-1 text-muted-foreground">
              <Link href="/dashboard/billing" className="text-primary hover:underline">Upgrade to unlock →</Link>
            </p>
          </div>
        </div>
      ) : programs === null ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : programs.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          No programs yet. Create your first to start enrolling affiliators.
        </Card>
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
                <span className="inline-flex items-center gap-3">
                  <Link href={`/dashboard/marketing/programs/${p.id}`} className="text-primary hover:underline text-xs">
                    Manage
                  </Link>
                  {/* Row halves of the two batch verbs above. Ripllo has
                      served DELETE /programs/{id} all along; the verb
                      was simply never declared, so nothing could offer
                      it. */}
                  <AgenticEntry
                    resource="programs"
                    mode="edit"
                    initial={{ ...p }}
                    onApplied={load}
                    title="Edit"
                    aria-label={`Edit affiliate program ${p.name}`}
                    className="inline-flex items-center text-muted-foreground hover:text-foreground"
                    fallback={null}
                  >
                    <Pencil className="h-4 w-4" />
                  </AgenticEntry>
                  <AgenticEntry
                    resource="programs"
                    mode="delete"
                    initial={{ id: p.id, name: p.name }}
                    onApplied={load}
                    title="Delete"
                    aria-label={`Delete affiliate program ${p.name}`}
                    className="inline-flex items-center text-muted-foreground hover:text-destructive"
                    fallback={null}
                  >
                    <Trash2 className="h-4 w-4" />
                  </AgenticEntry>
                </span>
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
          onSelectionChange={setSelection}
          renderBulkBar={
            assistantEnabled
              ? (rows, clear) => <BulkBar count={rows.length} noun="affiliate program" onClear={clear} />
              : undefined
          }
          searchPlaceholder="Search name, description…"
          defaultSort={{ key: 'name', dir: 'asc' }}
          empty="No programs match."
        />
      )}

      {bulkEditTargets && (
        <BulkEditSlot
          resource="programs"
          targets={bulkEditTargets.map((p) => ({ ...p }))}
          onClose={() => setBulkEditTargets(null)}
          onApplied={load}
        />
      )}

      {bulkDeleteTargets && (
        <BulkVerbSlot
          resource="programs"
          verb="delete"
          targets={bulkDeleteTargets.map((p) => ({ ...p }))}
          onClose={() => setBulkDeleteTargets(null)}
          onApplied={load}
        />
      )}

      <Dialog open={showForm} onOpenChange={(o) => !o && setShowForm(false)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New program</DialogTitle>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="prog-name">Name</Label>
              <Input id="prog-name" type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prog-desc">Description</Label>
              <Textarea id="prog-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prog-url">Storefront URL (where buyers land)</Label>
              <Input
                id="prog-url"
                type="url"
                placeholder="https://yourstore.storlaunch.com/"
                value={form.targetUrl}
                onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Affiliator share links redirect here with <span className="font-mono">?code=&lt;promo&gt;</span> appended.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prog-model">Commission model</Label>
                <Select value={form.commissionModel} onValueChange={(v) => setForm({ ...form, commissionModel: v })}>
                  <SelectTrigger id="prog-model"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="perf_redemption">Per redemption</SelectItem>
                    <SelectItem value="perf_sale">Per sale (% of GMV)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prog-rate">Commission rate (%)</Label>
                <Input id="prog-rate" type="number" min="0" max="100" step="0.5" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prog-cookie">Cookie days</Label>
                <Input id="prog-cookie" type="number" min="1" max="365" value={form.cookieDays} onChange={(e) => setForm({ ...form, cookieDays: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prog-follower">Min follower count</Label>
                <Input id="prog-follower" type="number" min="0" value={form.minFollowerCount} onChange={(e) => setForm({ ...form, minFollowerCount: e.target.value })} placeholder="No floor" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prog-fee">Ripllo platform fee (%)</Label>
              <Input id="prog-fee" type="number" min="0" max="50" step="0.5" value={form.platformFeeRate} onChange={(e) => setForm({ ...form, platformFeeRate: Number(e.target.value) })} />
            </div>
            <CampaignSelect
              value={form.marketingCampaignId}
              onChange={(id) => setForm({ ...form, marketingCampaignId: id })}
              disabled={working}
            />
            <div className="flex gap-4 text-sm">
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={form.autoApprove} onCheckedChange={(c) => setForm({ ...form, autoApprove: c === true })} />
                Auto-approve enrollments
              </Label>
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={form.requiresKyc} onCheckedChange={(c) => setForm({ ...form, requiresKyc: c === true })} />
                Require KYC
              </Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={working}>
                {working ? 'Creating…' : 'Create program'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
