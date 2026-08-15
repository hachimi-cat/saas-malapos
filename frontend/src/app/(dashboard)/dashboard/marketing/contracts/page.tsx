'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Check, Ban, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { marketingFetch } from '@/lib/marketing-api';
import { AgenticEntry, BulkVerbSlot } from '@/components/catentio/agentic-entry';
import { ActionsDropdown, type PageAction } from '@/components/dashboard/actions-dropdown';
import { BulkBar } from '@/components/dashboard/bulk-bar';
import { Checkbox } from '@/components/ui/checkbox';
import { useCatentioStatus } from '@/hooks/use-catentio';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Collab {
  id: string;
  campaignId: string;
  creatorId: string;
  status: string;
  agreedTotalIdr: number;
  platformFeeRate: number;
  netToCreatorIdr: number;
  createdAt: string;
  updatedAt: string;
  campaign: { id: string; name: string } | null;
  _count?: { deliverables: number };
}

const STATUS_TONE: Record<string, string> = {
  pending_funding: 'bg-amber-500/10 text-amber-600',
  active: 'bg-emerald-500/10 text-emerald-600',
  delivered: 'bg-sky-500/10 text-sky-400',
  approved: 'bg-emerald-500/15 text-emerald-700',
  paid: 'bg-emerald-500/20 text-emerald-700',
  disputed: 'bg-destructive/10 text-destructive',
  canceled: 'bg-secondary text-muted-foreground',
};

type Filter = 'awaiting_review' | 'in_progress' | 'all';

export default function ContractsPage() {
  const [rows, setRows] = useState<Collab[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('awaiting_review');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // A SNAPSHOT, not the derived selection — a partial failure reloads
  // the list under the open sheet, and a derived list would shrink and
  // unmount the sheet still naming the contract that refused.
  const [bulkVerb, setBulkVerb] = useState<{ verb: 'approve' | 'cancel' | 'dispute'; rows: Collab[] } | null>(null);
  const { enabled: assistantOn } = useCatentioStatus();

  async function load() {
    setRows(null);
    try {
      const status = filter === 'awaiting_review'
        ? 'delivered,disputed'
        : filter === 'in_progress'
          ? 'pending_funding,active'
          : '';
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const r = await marketingFetch(`/api/v1/account/marketing/collaborations?${params.toString()}`, { credentials: 'include' });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'failed to load');
      setRows(b?.data?.collaborations ?? []);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  // Counted against the CURRENT list, so a row that left the filter
  // drops out instead of being acted on invisibly.
  const selectedRows = (rows ?? []).filter((c) => selectedIds.has(c.id));
  const clearSelection = () => setSelectedIds(new Set());
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Verb-only: no create, no edit. Each item is proposed on a card the
  // merchant applies — approve releases the creator's payout.
  const pageActions: PageAction[] = assistantOn
    ? [
        {
          key: 'approve',
          label: selectedRows.length > 0 ? `Approve ${selectedRows.length} selected` : 'Approve selected',
          icon: Check,
          run: () => setBulkVerb({ verb: 'approve', rows: selectedRows }),
          requiresSelection: true,
        },
        {
          key: 'dispute',
          label: selectedRows.length > 0 ? `Dispute ${selectedRows.length} selected` : 'Dispute selected',
          icon: AlertTriangle,
          run: () => setBulkVerb({ verb: 'dispute', rows: selectedRows }),
          requiresSelection: true,
        },
        {
          key: 'cancel',
          label: selectedRows.length > 0 ? `Cancel ${selectedRows.length} selected` : 'Cancel selected',
          icon: Ban,
          run: () => setBulkVerb({ verb: 'cancel', rows: selectedRows }),
          requiresSelection: true,
          destructive: true,
        },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Contracts"
        description="Active creator collaborations across every campaign. Default view is drafts awaiting your review — toggle filters to see in-progress or all."
        action={
          <ActionsDropdown
            actions={pageActions}
            selectionCount={selectedRows.length}
            noun="contract"
          />
        }
      />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="mb-5">
          <TabsTrigger value="awaiting_review">Awaiting review</TabsTrigger>
          <TabsTrigger value="in_progress">In progress</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive px-4 py-2 text-sm">{error}</div>}

      {rows === null ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          {filter === 'awaiting_review'
            ? 'Nothing awaiting your review. Drafts will appear here when creators submit them.'
            : filter === 'in_progress'
              ? 'No active collaborations.'
              : 'No collaborations yet. Accept a creator application to spin one up.'}
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/marketing/collaborations/${c.id}`}
              className="block"
            >
              <Card className="p-5 transition hover:border-primary">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* The card IS a Link — kill the click's navigation
                      default here, keep the checkbox toggle. */}
                  <span
                    className="flex shrink-0 items-center pt-0.5"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  >
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggleSelected(c.id)}
                      aria-label={`Select contract ${c.campaign?.name ?? c.id}`}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.campaign?.name ?? 'Campaign'}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Creator <span className="font-mono">{c.creatorId.replace('crt_', '')}</span> · {c._count?.deliverables ?? 0} deliverable(s)
                    </p>
                  </div>
                  <Badge variant="outline" className={`rounded-full text-xs font-medium capitalize ${STATUS_TONE[c.status] ?? 'bg-secondary text-muted-foreground'}`}>
                    {c.status.replace(/_/g, ' ')}
                  </Badge>
                  {/* Row halves of the three batch verbs. `fallback={null}`
                      — with the assistant off the manual path is the
                      contract's own screen, one click away on this card. */}
                  <span
                    className="flex shrink-0 items-center gap-1"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  >
                    <AgenticEntry
                      resource="collaborations"
                      mode="approve"
                      initial={{ id: c.id, campaign: c.campaign?.name }}
                      onApplied={load}
                      title="Approve"
                      aria-label={`Approve contract ${c.campaign?.name ?? c.id}`}
                      className="inline-flex items-center rounded p-1 text-muted-foreground hover:text-emerald-500"
                      fallback={null}
                    >
                      <Check className="h-4 w-4" />
                    </AgenticEntry>
                    <AgenticEntry
                      resource="collaborations"
                      mode="dispute"
                      initial={{ id: c.id, campaign: c.campaign?.name }}
                      onApplied={load}
                      title="Dispute"
                      aria-label={`Dispute contract ${c.campaign?.name ?? c.id}`}
                      className="inline-flex items-center rounded p-1 text-muted-foreground hover:text-amber-500"
                      fallback={null}
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </AgenticEntry>
                    <AgenticEntry
                      resource="collaborations"
                      mode="cancel"
                      initial={{ id: c.id, campaign: c.campaign?.name }}
                      onApplied={load}
                      title="Cancel"
                      aria-label={`Cancel contract ${c.campaign?.name ?? c.id}`}
                      className="inline-flex items-center rounded p-1 text-muted-foreground hover:text-destructive"
                      fallback={null}
                    >
                      <Ban className="h-4 w-4" />
                    </AgenticEntry>
                  </span>
                </div>
                <div className="mt-3 grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-3">
                  <Stat label="Gross" value={`Rp ${c.agreedTotalIdr.toLocaleString()}`} />
                  <Stat label="Ripllo fee" value={`${(c.platformFeeRate * 100).toFixed(1)}%`} />
                  <Stat label="Net released" value={c.netToCreatorIdr > 0 ? `Rp ${c.netToCreatorIdr.toLocaleString()}` : '—'} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <BulkBar count={selectedRows.length} noun="contract" onClear={clearSelection} />

      {bulkVerb && (
        <BulkVerbSlot
          resource="collaborations"
          verb={bulkVerb.verb}
          targets={bulkVerb.rows.map((c) => ({ ...c }))}
          onClose={() => setBulkVerb(null)}
          onApplied={load}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
