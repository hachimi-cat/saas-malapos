'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Megaphone,
  Loader2,
  Tag,
  Plus,
  X,
  RefreshCw,
  Gift,
  ExternalLink,
  Search,
  Archive,
} from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';

/*
 * Marketing dashboard — the Marketing (Ripllo) module's deep-link target
 * (/dashboard/marketing). Three surfaces, all proxied through
 * /api/v1/marketing over the gated per-merchant Ripllo client:
 *
 *   1. Discount codes — list / create / archive (Ripllo owns the state).
 *   2. Loyalty program — earn rate + redeem value + enable toggle.
 *   3. Member lookup — a customer's points balance + recent ledger.
 *
 * When the Marketing module is OFF the backend returns 409
 * MARKETING_MODULE_DISABLED and this page shows the enable empty state.
 * Built against the real backend; no mock data.
 */

type DiscountType = 'percent' | 'fixed' | 'shipping_percent' | 'shipping_fixed';

type DiscountCode = {
  id: string;
  code: string;
  description: string | null;
  type: DiscountType;
  value: number;
  active: boolean;
  redemptionCount: number;
  minPurchaseAmount: number | null;
  maxUsesTotal: number | null;
  expiresAt: string | null;
};

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

function formatType(type: DiscountType, value: number): string {
  switch (type) {
    case 'percent':
      return `${value}% off`;
    case 'fixed':
      return `${rupiah(value)} off`;
    case 'shipping_percent':
      return `${value}% off shipping`;
    case 'shipping_fixed':
      return `${rupiah(value)} off shipping`;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function MarketingPage() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [program, setProgram] = useState<LoyaltyProgram>(null);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setModuleOff(false);
    try {
      const [codesRes, programRes] = await Promise.all([
        api.get<DiscountCode[]>('/marketing/discount-codes'),
        api.get<LoyaltyProgram>('/marketing/loyalty/program'),
      ]);
      setCodes(codesRes.data ?? []);
      setProgram(programRes.data ?? null);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        setModuleOff(true);
      } else {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load marketing');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function archive(id: string) {
    try {
      await api.delete(`/marketing/discount-codes/${id}`);
      void load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to archive code');
    }
  }

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
            Marketing uses Ripllo to run discount codes and a points-based loyalty program across
            your outlets. Turn on the Marketing module to reward repeat customers and stamp
            redemptions at the till.
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Megaphone className="h-6 w-6 text-primary" /> Marketing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Discount codes and loyalty points for your customers. Powered by Ripllo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New code
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Discount codes ───────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Tag className="h-4 w-4 text-muted-foreground" /> Discount codes
          </h2>
          <span className="text-xs text-muted-foreground">{codes.length} total</span>
        </div>
        {codes.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No discount codes yet. Create one to give customers a reason to come back.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {codes.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{c.code}</span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        c.active
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {c.active ? 'Active' : 'Archived'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatType(c.type, c.value)}
                    {c.minPurchaseAmount ? ` · min ${rupiah(c.minPurchaseAmount)}` : ''}
                    {` · ${c.redemptionCount} used`}
                    {c.expiresAt ? ` · expires ${formatDate(c.expiresAt)}` : ''}
                  </div>
                </div>
                {c.active && (
                  <button
                    type="button"
                    onClick={() => void archive(c.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                  >
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Loyalty program ──────────────────────────────────────────── */}
      <LoyaltyCard program={program} onSaved={setProgram} onError={setError} />

      {/* ── Member lookup ────────────────────────────────────────────── */}
      <MemberLookup onError={setError} />

      {createOpen && (
        <CreateCodeModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void load();
          }}
        />
      )}
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
          <Gift className="h-4 w-4 text-muted-foreground" /> Loyalty program
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
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Customer ID
            </span>
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

// ── Create discount-code modal ────────────────────────────────────────
function CreateCodeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState('');
  const [type, setType] = useState<DiscountType>('percent');
  const [value, setValue] = useState('');
  const [minPurchase, setMinPurchase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/marketing/discount-codes', {
        code: code.trim().toUpperCase(),
        type,
        value: Number(value) || 0,
        minPurchaseAmount: minPurchase ? Number(minPurchase) : null,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to create code');
    } finally {
      setSubmitting(false);
    }
  }

  const isPercent = type === 'percent' || type === 'shipping_percent';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-semibold">New discount code</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="WELCOME10"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm uppercase focus:border-primary focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as DiscountType)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount off (IDR)</option>
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {isPercent ? 'Percent' : 'Amount (IDR)'}
              </span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="numeric"
                placeholder={isPercent ? '10' : '15000'}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Min. purchase (IDR)
              </span>
              <input
                value={minPurchase}
                onChange={(e) => setMinPurchase(e.target.value)}
                inputMode="numeric"
                placeholder="optional"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </label>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!code.trim() || !value || submitting}
            onClick={() => void submit()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create code
          </button>
        </div>
      </div>
    </div>
  );
}
