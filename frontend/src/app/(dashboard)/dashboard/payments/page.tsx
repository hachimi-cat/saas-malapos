'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet, Loader2, RefreshCw, ExternalLink, QrCode, Banknote } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';

/*
 * Payments dashboard — the Payment (Plugipay) module's deep-link target.
 * Shows the workspace's available balance, recent dynamic-QRIS checkout
 * sessions, and recent payouts via the gated per-merchant Plugipay client.
 *
 * Everything proxies through /api/v1/payments/overview, which is gated on
 * the Payment module: when it's OFF the backend returns 409
 * PAYMENT_MODULE_DISABLED and this page shows the enable empty state.
 * Built against the real backend; no mock data.
 */

type CheckoutSession = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
};
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
  sessions: CheckoutSession[];
  payouts: Payout[];
};

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === 'completed' || s === 'paid')
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  if (s === 'expired' || s === 'canceled' || s === 'failed')
    return 'bg-destructive/10 text-destructive';
  if (s === 'open' || s === 'pending' || s === 'in_transit')
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

export default function PaymentsPage() {
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
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load payments');
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
        <Loader2 className="h-4 w-4 animate-spin" /> Loading payments…
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
            Payments uses Plugipay to accept real dynamic QRIS at the sell screen — the customer
            scans, the sale settles automatically. Turn on the Payments module to take live QRIS
            and see your balance, transactions, and payouts here.
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
          <h1 className="text-xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Live QRIS, balance, and payouts from your Plugipay workspace.
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

      {/* Balance */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Banknote className="h-4 w-4" /> Available balance
        </div>
        <p className="mt-1 text-2xl font-bold text-primary">
          {data?.balance ? rupiah(data.balance.balance) : '—'}
        </p>
        {!data?.balance && (
          <p className="mt-1 text-xs text-muted-foreground">
            No balance yet — once a customer pays a QRIS sale it lands here.
          </p>
        )}
      </div>

      {/* Recent QRIS sessions */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm font-medium">
          <QrCode className="h-4 w-4 text-primary" /> Recent QRIS transactions
        </div>
        {data?.sessions.length ? (
          <div className="divide-y divide-border">
            {data.sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">{rupiah(s.amount)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(s.status)}`}>
                  {prettyStatus(s.status)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No QRIS transactions yet. Charge a sale with QRIS at the{' '}
            <Link href="/dashboard/sell" className="text-primary underline">
              sell screen
            </Link>
            .
          </p>
        )}
      </div>

      {/* Recent payouts */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm font-medium">
          <Wallet className="h-4 w-4 text-primary" /> Recent payouts
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
            No payouts yet.
          </p>
        )}
      </div>
    </div>
  );
}
