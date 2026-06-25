'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';
import { checkoutSessionsApi, CheckoutSession } from '@/lib/payments-api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

const STATUS_COLOR: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-400',
  open: 'bg-yellow-500/10 text-yellow-400',
  pending_review: 'bg-amber-500/10 text-amber-400',
  expired: 'bg-muted text-muted-foreground',
  canceled: 'bg-muted text-muted-foreground',
  refunded: 'bg-purple-500/10 text-purple-400',
};

type SessionDetail = CheckoutSession;

const btnSecondary =
  'inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50';
const btnPrimary =
  'inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50';

export default function PaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [session, setSession] = React.useState<SessionDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await checkoutSessionsApi.get(id);
      const body = res.data as unknown as { data?: SessionDetail } | SessionDetail;
      setSession(((body as { data?: SessionDetail }).data ?? body) as SessionDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function confirmSession() {
    setError(null);
    setInfo(null);
    setConfirming(true);
    try {
      await checkoutSessionsApi.confirm(id);
      setInfo('Session confirmed. Customer receipt email sent.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Confirm failed');
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <div className="p-8 text-sm text-red-400">{error ?? 'Session not found'}</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="text-xs text-muted-foreground">
        <Link href="/dashboard/payments" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Checkout sessions
        </Link>
        <span className="mx-1.5 text-muted-foreground/50">/</span>
        <span className="font-mono text-foreground">{session.id}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {session.currency === 'IDR' ? formatCurrency(session.amount) : `${session.currency} ${session.amount}`}
          </h1>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                STATUS_COLOR[session.status] ?? 'bg-muted text-muted-foreground',
              )}
            >
              {session.status.replace(/_/g, ' ')}
            </span>
            {session.adapter && (
              <span className="font-mono text-xs capitalize text-muted-foreground">· {session.adapter}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {session.status === 'pending_review' && session.adapter === 'manual' && (
            <button type="button" onClick={confirmSession} disabled={confirming} className={btnPrimary}>
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirm payment received
            </button>
          )}
          <button type="button" onClick={load} className={btnSecondary}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
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

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold">Session</h2>
        <div className="space-y-2 text-sm">
          <Kv label="ID" value={session.id} mono />
          {session.mode && <Kv label="Mode" value={session.mode} />}
          <Kv label="Customer" value={session.customerId ?? '—'} mono />
          <Kv label="Payment ID" value={session.paymentId ?? '—'} mono />
          <Kv label="Created" value={formatDate(session.createdAt)} />
          {session.expiresAt && <Kv label="Expires" value={formatDate(session.expiresAt)} />}
          {session.completedAt && (
            <Kv label="Completed" value={new Date(session.completedAt).toLocaleString()} />
          )}
          {session.hostedUrl && (
            <div className="pt-2 text-xs">
              <a
                href={session.hostedUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Hosted checkout <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={(mono ? 'font-mono text-xs ' : '') + 'text-right text-foreground'}>{value}</span>
    </div>
  );
}
