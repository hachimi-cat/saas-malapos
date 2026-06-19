'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Megaphone, Loader2, Gift, ExternalLink, Search } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';

/*
 * Loyalty — the Marketing (Ripllo) module's "Loyalty program" sub-page.
 * Configure the points program (GET/PUT /marketing/loyalty/program) and
 * look up a customer's points balance + ledger (GET
 * /marketing/loyalty/members/:customerId). Discount codes live on the
 * main /dashboard/marketing page. When the Marketing module is OFF the
 * backend returns 409 and this page shows the enable empty state. Built
 * against the real backend; no mock data.
 */

type LoyaltyProgram = {
  id: string;
  enabled: boolean;
  earnRatePoints: number;
  redeemValueIdr: number;
} | null;

type LedgerEntry = {
  id: string;
  delta: number;
  kind: string;
  status: string;
  note: string | null;
  createdAt: string;
};

type MemberResult = {
  balance: { balance: number; exists: boolean };
  history: LedgerEntry[];
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function LoyaltyPage() {
  const [program, setProgram] = useState<LoyaltyProgram>(null);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setModuleOff(false);
    try {
      const programRes = await api.get<LoyaltyProgram>('/marketing/loyalty/program');
      setProgram(programRes.data ?? null);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        setModuleOff(true);
      } else {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load loyalty');
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
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (moduleOff) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-lg border border-border bg-card px-8 py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Megaphone className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold">Enable the Marketing module</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Loyalty uses Ripllo to run a points-based program across your outlets. Turn on the
            Marketing module to reward repeat customers and stamp redemptions at the till.
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
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Gift className="h-6 w-6 text-primary" /> Loyalty program
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Points-based rewards for your customers. Powered by Ripllo.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <LoyaltyCard program={program} onSaved={setProgram} onError={setError} />
      <MemberLookup onError={setError} />
    </div>
  );
}

// ── Loyalty program card ──────────────────────────────────────────────
function LoyaltyCard({
  program,
  onSaved,
  onError,
}: {
  program: LoyaltyProgram;
  onSaved: (p: LoyaltyProgram) => void;
  onError: (msg: string | null) => void;
}) {
  const [enabled, setEnabled] = useState(program?.enabled ?? false);
  const [earnRate, setEarnRate] = useState(String(program?.earnRatePoints ?? 1));
  const [redeemValue, setRedeemValue] = useState(String(program?.redeemValueIdr ?? 100));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(program?.enabled ?? false);
    setEarnRate(String(program?.earnRatePoints ?? 1));
    setRedeemValue(String(program?.redeemValueIdr ?? 100));
  }, [program]);

  async function save() {
    setSaving(true);
    onError(null);
    try {
      const { data } = await api.put<LoyaltyProgram>('/marketing/loyalty/program', {
        enabled,
        earnRatePoints: Number(earnRate) || 0,
        redeemValueIdr: Number(redeemValue) || 0,
      });
      onSaved(data);
    } catch (e) {
      onError(e instanceof ApiRequestError ? e.message : 'Failed to save loyalty program');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Gift className="h-4 w-4 text-muted-foreground" /> Program settings
        </h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 accent-[hsl(var(--primary))]"
          />
          Enabled
        </label>
      </div>
      <div className="space-y-4 px-6 py-4">
        <p className="text-sm text-muted-foreground">
          Points apply at the till when a sale is attached to a customer. Earn accrues on the sale
          total; redemption converts points to a rupiah discount.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Earn rate — points per Rp 1.000 spent
            </span>
            <input
              value={earnRate}
              onChange={(e) => setEarnRate(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Redeem value — rupiah per 1 point
            </span>
            <input
              value={redeemValue}
              onChange={(e) => setRedeemValue(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save program
        </button>
      </div>
    </div>
  );
}

// ── Member balance lookup ─────────────────────────────────────────────
function MemberLookup({ onError }: { onError: (msg: string | null) => void }) {
  const [customerId, setCustomerId] = useState('');
  const [result, setResult] = useState<MemberResult | null>(null);
  const [looking, setLooking] = useState(false);

  async function lookup() {
    if (!customerId.trim()) return;
    setLooking(true);
    onError(null);
    setResult(null);
    try {
      const { data } = await api.get<MemberResult>(
        `/marketing/loyalty/members/${encodeURIComponent(customerId.trim())}`,
      );
      setResult(data);
    } catch (e) {
      onError(e instanceof ApiRequestError ? e.message : 'Failed to look up member');
    } finally {
      setLooking(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Search className="h-4 w-4 text-muted-foreground" /> Member balance
        </h2>
      </div>
      <div className="space-y-4 px-6 py-4">
        <div className="flex items-end gap-2">
          <label className="block flex-1">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Customer ID</span>
            <input
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void lookup()}
              placeholder="cust_…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </label>
          <button
            type="button"
            disabled={looking || !customerId.trim()}
            onClick={() => void lookup()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Look up
          </button>
        </div>

        {result && (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
              <div className="text-xs text-muted-foreground">Current balance</div>
              <div className="text-2xl font-bold">
                {result.balance.balance.toLocaleString('id-ID')}{' '}
                <span className="text-sm font-normal text-muted-foreground">points</span>
              </div>
              {!result.balance.exists && (
                <div className="mt-1 text-xs text-muted-foreground">
                  No loyalty activity yet for this customer.
                </div>
              )}
            </div>
            {result.history.length > 0 && (
              <div className="divide-y divide-border rounded-md border border-border">
                {result.history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium capitalize">
                        {h.kind}
                        {h.status !== 'confirmed' ? (
                          <span className="ml-2 text-xs text-muted-foreground">({h.status})</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDate(h.createdAt)}</div>
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        h.delta >= 0 ? 'text-primary' : 'text-destructive'
                      }`}
                    >
                      {h.delta >= 0 ? '+' : ''}
                      {h.delta.toLocaleString('id-ID')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
