'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { payoutsApi, Payout } from '@/lib/payments-api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

const STATUS_COLOR: Record<string, string> = {
  paid: 'bg-green-500/10 text-green-400',
  in_transit: 'bg-blue-500/10 text-blue-400',
  pending: 'bg-yellow-500/10 text-yellow-400',
  failed: 'bg-red-500/10 text-red-400',
  cancelled: 'bg-muted text-muted-foreground',
  canceled: 'bg-muted text-muted-foreground',
};

export default function PayoutDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [payout, setPayout] = React.useState<Payout | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    payoutsApi
      .get(id)
      .then((res) => {
        const body = res.data as unknown as { data?: Payout } | Payout;
        setPayout(((body as { data?: Payout }).data ?? body) as Payout);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!payout) return <div className="p-8 text-sm text-red-400">{error ?? 'Not found'}</div>;

  const fmt = (n: number) =>
    payout.currency === 'IDR' ? formatCurrency(n) : `${payout.currency} ${n.toFixed(2)}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="text-xs text-muted-foreground">
        <Link href="/dashboard/payments/payouts" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Payouts
        </Link>
        <span className="mx-1.5 text-muted-foreground/50">/</span>
        <span className="font-mono text-foreground">{payout.id}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tabular-nums tracking-tight">{fmt(payout.amount)}</h1>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                STATUS_COLOR[payout.status] ?? 'bg-muted text-muted-foreground',
              )}
            >
              {payout.status.replace(/_/g, ' ')}
            </span>
            <span className="font-mono text-xs capitalize text-muted-foreground">· {payout.method}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold">Destination</h2>
          <div className="space-y-3">
            <Kv label="Bank" value={payout.bankName ?? '—'} />
            <Kv label="Account holder" value={payout.bankAccountHolder ?? '—'} />
            <Kv label="Account number" value={payout.bankAccountNumber ?? '—'} mono />
            {payout.bankCode && <Kv label="Bank code" value={payout.bankCode} mono />}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold">Timeline</h2>
          <div className="space-y-3">
            <Kv label="Requested" value={formatDate(payout.requestedAt ?? payout.createdAt)} />
            <Kv label="Processed" value={payout.processedAt ? formatDate(payout.processedAt) : '—'} />
            <Kv label="Completed" value={payout.completedAt ? formatDate(payout.completedAt) : '—'} />
            {payout.reference && <Kv label="Reference" value={payout.reference} mono />}
            {payout.ledgerTransactionId && <Kv label="Ledger tx" value={payout.ledgerTransactionId} mono />}
          </div>
        </div>
      </div>

      {(payout.note || payout.failureReason) && (
        <div className="rounded-lg border border-border bg-card p-6">
          {payout.note && (
            <div>
              <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Note</p>
              <p className="text-sm">{payout.note}</p>
            </div>
          )}
          {payout.failureReason && (
            <div className="mt-4">
              <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Failure reason</p>
              <p className="text-sm text-red-400">{payout.failureReason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</p>
    </div>
  );
}
