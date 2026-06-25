'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pause, Play, X, Loader2 } from 'lucide-react';
import { subscriptionsApi, Subscription } from '@/lib/payments-api';
import { formatDate, cn } from '@/lib/utils';

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400',
  trialing: 'bg-blue-500/10 text-blue-400',
  past_due: 'bg-amber-500/10 text-amber-400',
  paused: 'bg-yellow-500/10 text-yellow-400',
  canceled: 'bg-muted text-muted-foreground',
};

interface SubscriptionDetail extends Subscription {
  cancelAt?: string | null;
  priceId?: string | null;
}

const btnSecondary =
  'inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50';
const btnDanger =
  'inline-flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50';

export default function SubscriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [sub, setSub] = React.useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await subscriptionsApi.get(id);
      const body = res.data as unknown as { data?: SubscriptionDetail } | SubscriptionDetail;
      setSub(((body as { data?: SubscriptionDetail }).data ?? body) as SubscriptionDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function pause() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await subscriptionsApi.pause(id);
      setInfo('Subscription paused');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pause failed');
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await subscriptionsApi.resume(id);
      setInfo('Subscription resumed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resume failed');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(atPeriodEnd: boolean) {
    if (!confirm(atPeriodEnd ? 'Cancel at end of current period?' : 'Cancel immediately? This stops billing right now.')) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await subscriptionsApi.cancel(id, !atPeriodEnd);
      setInfo(atPeriodEnd ? 'Will cancel at period end' : 'Canceled immediately');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!sub) return <div className="p-8 text-sm text-red-400">{error ?? 'Not found'}</div>;

  const isCanceled = sub.status === 'canceled';
  const isPaused = sub.status === 'paused';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="text-xs text-muted-foreground">
        <Link href="/dashboard/payments/subscriptions" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Subscriptions
        </Link>
        <span className="mx-1.5 text-muted-foreground/50">/</span>
        <span className="font-mono text-foreground">{id}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Subscription</h1>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                STATUS_COLOR[sub.status] ?? 'bg-muted text-muted-foreground',
              )}
            >
              {sub.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="mt-1 font-mono text-[13px] text-muted-foreground">
            {sub.id} · created {formatDate(sub.createdAt)} · next charge {formatDate(sub.currentPeriodEnd)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isCanceled && !isPaused && (
            <button type="button" onClick={pause} disabled={busy} className={btnSecondary}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
              Pause
            </button>
          )}
          {isPaused && (
            <button type="button" onClick={resume} disabled={busy} className={btnSecondary}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Resume
            </button>
          )}
          {!isCanceled && (
            <>
              <button type="button" onClick={() => cancel(true)} disabled={busy} className={btnSecondary}>
                Cancel at period end
              </button>
              <button type="button" onClick={() => cancel(false)} disabled={busy} className={btnDanger}>
                <X className="h-4 w-4" /> Cancel now
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs font-mono text-red-400">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-border bg-green-500/10 px-3 py-2 text-xs font-mono text-green-400">
          {info}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold">Billing schedule</h2>
          <div className="space-y-1">
            <Kv label="Current period" value={`${formatDate(sub.currentPeriodStart)} → ${formatDate(sub.currentPeriodEnd)}`} />
            <Kv label="Trial ends" value={sub.trialEnd ? formatDate(sub.trialEnd) : '—'} />
            <Kv label="Cancels at" value={sub.cancelAt ? formatDate(sub.cancelAt) : sub.cancelAtPeriodEnd ? formatDate(sub.currentPeriodEnd) : '—'} />
            <Kv label="Canceled at" value={sub.canceledAt ? formatDate(sub.canceledAt) : '—'} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold">Customer & plan</h2>
          <div className="space-y-3">
            <Kv label="Customer" value={sub.customerId} mono />
            <Kv label="Plan" value={sub.planId} mono />
            {sub.priceId && <Kv label="Price" value={sub.priceId} mono />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={'text-right text-sm text-foreground ' + (mono ? 'font-mono text-[12.5px]' : '')}>{value}</span>
    </div>
  );
}
