'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet, Loader2, RefreshCw, ExternalLink, Banknote, Landmark } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';

/*
 * Payouts — the Payment (Plugipay) module's "Payouts" sub-page. Payouts
 * are owned + initiated in the merchant's Plugipay workspace; Malapos
 * surfaces the available balance + recent payout history read straight
 * from /api/v1/payments/overview (the same gated Plugipay client the
 * Transactions page uses). When the Payments module is OFF the backend
 * returns 409 and this page shows the enable empty state. No mock data.
 */

type Payout = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
};
type AvailableBalance = { balance: number; currency: string } | null;

type Overview = {
  balance: AvailableBalance;
  payouts: Payout[];
};

const PLUGIPAY_DASHBOARD = 'https://plugipay.com/dashboard';

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === 'completed' || s === 'paid')
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  if (s === 'failed' || s === 'canceled' || s === 'cancelled')
    return 'bg-destructive/10 text-destructive';
  if (s === 'pending' || s === 'in_transit' || s === 'processing')
    return 'bg-primary/10 text-primary';
  return 'bg-muted text-muted-foreground';
}

function prettyStatus(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function PayoutsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setModuleOff(false);
    try {
      const res = await api.get<Overview>('/payments/overview');
      setData(res.data);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        setModuleOff(true);
      } else {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load payouts');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading payouts…
      </div>
    );
  }

  if (moduleOff) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-lg border border-border bg-card px-8 py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold">Enable the Payments module</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Payouts settle the money you collect via QRIS into your bank account through Plugipay.
            Turn on the Payments module to see your balance and payout history here.
          </p>
          <Link
            href="/dashboard/settings/modules"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to Modules <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Payouts</h1>
          <p className="text-sm text-muted-foreground">
            Settlements from your collected QRIS balance to your bank, via Plugipay.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {/* Available balance */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Banknote className="h-4 w-4" /> Available balance
        </div>
        <p className="mt-1 text-2xl font-bold text-primary">
          {data?.balance ? rupiah(data.balance.balance) : '—'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Payouts are scheduled and initiated in your Plugipay workspace.{' '}
          <a
            href={PLUGIPAY_DASHBOARD}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-primary hover:underline"
          >
            Open Plugipay <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      {/* Recent payouts */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm font-medium">
          <Landmark className="h-4 w-4 text-primary" /> Recent payouts
        </div>
        {data?.payouts.length ? (
          <div className="divide-y divide-border">
            {data.payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">{rupiah(p.amount)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(p.status)}`}>
                  {prettyStatus(p.status)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No payouts yet. Once you collect QRIS sales, payouts to your bank appear here.
          </p>
        )}
      </div>
    </div>
  );
}
