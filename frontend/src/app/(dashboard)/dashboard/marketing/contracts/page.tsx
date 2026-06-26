'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Handshake, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { marketingFetch } from '@/lib/marketing-api';

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
  delivered: 'bg-blue-500/10 text-blue-600',
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

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        icon={Handshake}
        title="Contracts"
        description="Active creator collaborations across every campaign. Default view is drafts awaiting your review — toggle filters to see in-progress or all."
      />

      <div className="mb-5 flex items-center gap-1 rounded-md border border-border bg-card p-1">
        <FilterChip active={filter === 'awaiting_review'} onClick={() => setFilter('awaiting_review')} label="Awaiting review" />
        <FilterChip active={filter === 'in_progress'} onClick={() => setFilter('in_progress')} label="In progress" />
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
      </div>

      {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">{error}</div>}

      {rows === null ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          {filter === 'awaiting_review'
            ? 'Nothing awaiting your review. Drafts will appear here when creators submit them.'
            : filter === 'in_progress'
              ? 'No active collaborations.'
              : 'No collaborations yet. Accept a creator application to spin one up.'}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/marketing/collaborations/${c.id}`}
              className="block rounded-xl border border-border bg-card p-5 transition hover:border-brand-500"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{c.campaign?.name ?? 'Campaign'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Creator <span className="font-mono">{c.creatorId.replace('crt_', '')}</span> · {c._count?.deliverables ?? 0} deliverable(s)
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${STATUS_TONE[c.status] ?? 'bg-secondary text-muted-foreground'}`}>
                  {c.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="mt-3 grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-3">
                <Stat label="Gross" value={`Rp ${c.agreedTotalIdr.toLocaleString()}`} />
                <Stat label="Ripllo fee" value={`${(c.platformFeeRate * 100).toFixed(1)}%`} />
                <Stat label="Net released" value={c.netToCreatorIdr > 0 ? `Rp ${c.netToCreatorIdr.toLocaleString()}` : '—'} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm transition ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
    >
      {label}
    </button>
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
