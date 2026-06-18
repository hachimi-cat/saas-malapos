'use client';

/*
 * Billing — current plan + plan tiers, powered by Plugipay hosted
 * checkout (the family pattern). The page renders whatever
 * GET /api/v1/billing returns — tier definitions live in the backend
 * (src/lib/billing.ts), not here.
 *
 * EARLY ACCESS: while the backend reports `earlyAccess === true`, no
 * plan is charged. Upgrade buttons are disabled and labelled "Free
 * during early access" — we never call checkout. When early access
 * ends, the upgrade button on each paid tier POSTs /billing/checkout
 * and redirects the browser to the returned hostedUrl; Plugipay sends
 * the browser back here with ?status=success|canceled.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';

const TIER_ORDER = ['free', 'starter', 'growth', 'business'];
function tierRank(id: string): number {
  return TIER_ORDER.indexOf(id);
}

interface Subscription {
  id: string | null;
  accountId: string;
  tier: string;
  status: string;
  plugipayCheckoutSessionId: string | null;
  currentPeriodEnd: string | null;
}

interface TierDef {
  id: string;
  name: string;
  priceIdr: number;
  blurb: string;
  outletLimit: number;
  memberLimit: number;
  productLimit: number;
  inventory: boolean;
  multiOutlet: boolean;
  loyalty: boolean;
  purchasing: boolean;
  batchTracking: boolean;
  brandingRemoval: boolean;
  prioritySupport: boolean;
  features: string[];
}

interface BillingData {
  subscription: Subscription;
  effectiveTier: 'free' | 'starter' | 'growth' | 'business';
  earlyAccess: boolean;
  tiers: TierDef[];
}

const STATUS_TONES: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  past_due: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  canceled: 'bg-muted text-muted-foreground border-border',
};

function BillingContent() {
  const searchParams = useSearchParams();
  const checkoutStatus = searchParams.get('status'); // success | canceled | null

  const [data, setData] = useState<BillingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyTier, setBusyTier] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<BillingData>('/billing')
      .then(({ data }) => setData(data))
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : 'Could not load billing'),
      );
  }, []);

  async function upgrade(tier: string) {
    setError(null);
    setBusyTier(tier);
    try {
      const { data } = await api.post<{ checkoutSessionId: string; hostedUrl: string }>(
        '/billing/checkout',
        { tier },
      );
      window.location.href = data.hostedUrl;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not start checkout');
      setBusyTier(null);
    }
  }

  async function downgradeToFree() {
    if (
      !confirm(
        'Downgrade to Free? You keep your current plan until the paid period ends — no refund, no further charges.',
      )
    )
      return;
    setError(null);
    setBusyTier('free');
    try {
      await api.post('/billing/cancel');
      window.location.reload();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not downgrade');
      setBusyTier(null);
    }
  }

  const sub = data?.subscription;
  const earlyAccess = data?.earlyAccess ?? false;
  const currentTier = data?.effectiveTier ?? 'free';
  const currentDef = data?.tiers.find((t) => t.id === currentTier);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One flat price per workspace, billed in IDR through Plugipay.
        </p>
      </header>

      {earlyAccess && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-foreground">
          <p className="font-medium text-primary">Malapos is in early access — every plan is free right now.</p>
          <p className="mt-1 text-muted-foreground">
            Pick the plan that fits your shop to see what you&apos;ll get. We&apos;ll let you know
            well before billing starts — nothing is charged today.
          </p>
        </div>
      )}

      {checkoutStatus === 'success' && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-400">
          <p className="font-medium">Payment received — thank you!</p>
          <p className="mt-1">
            Your plan updates as soon as Plugipay confirms the payment (usually a few seconds).
            Refresh if it hasn&apos;t appeared yet.
          </p>
        </div>
      )}
      {checkoutStatus === 'canceled' && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
          <p className="font-medium">Checkout canceled.</p>
          <p className="mt-1">No charge was made — you can pick a plan again any time.</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Current plan ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Current plan
        </h2>
        {!data ? (
          <p className="mt-3 text-sm text-muted-foreground">{error ? '—' : 'Loading…'}</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-2xl font-bold tracking-tight">
              {currentDef?.name ?? currentTier}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                STATUS_TONES[sub?.status ?? 'active'] ?? STATUS_TONES.active
              }`}
            >
              {(sub?.status ?? 'active').replace('_', ' ')}
            </span>
            <span className="text-sm text-muted-foreground">
              {earlyAccess
                ? 'Free during early access'
                : currentDef && currentDef.priceIdr > 0
                  ? `${rupiah(currentDef.priceIdr)}/mo`
                  : 'Free'}
            </span>
            {!earlyAccess && sub?.currentPeriodEnd && (
              <span className="text-sm text-muted-foreground">
                Renews{' '}
                {new Date(sub.currentPeriodEnd).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>
        )}
      </section>

      {/* ── Tier cards ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Plans
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(data?.tiers ?? []).map((tier) => {
            const isCurrent = tier.id === currentTier;
            return (
              <div
                key={tier.id}
                className={`flex flex-col rounded-xl border bg-card p-5 ${
                  isCurrent
                    ? 'border-primary shadow-lg shadow-primary/10'
                    : 'border-border shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold">{tier.name}</h3>
                  {isCurrent && (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      Current plan
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{tier.blurb}</p>
                <p className="mt-4">
                  <span className="text-2xl font-bold tabular-nums tracking-tight">
                    {rupiah(tier.priceIdr)}
                  </span>
                  {tier.priceIdr > 0 && (
                    <span className="ml-1 text-sm text-muted-foreground">/mo</span>
                  )}
                </p>
                <ul className="mt-4 flex-1 space-y-2">
                  {tier.features.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-xs leading-[1.45] text-foreground/90"
                    >
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={2.25} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                {/* Action — early access disables all checkout. */}
                {earlyAccess ? (
                  isCurrent ? (
                    <div className="mt-5 rounded-md border border-border py-2 text-center text-sm font-medium text-muted-foreground">
                      Your plan
                    </div>
                  ) : (
                    <button
                      disabled
                      className="mt-5 cursor-not-allowed rounded-md border border-border py-2 text-center text-sm font-medium text-muted-foreground opacity-70"
                    >
                      Free during early access
                    </button>
                  )
                ) : isCurrent ? (
                  <div className="mt-5 rounded-md border border-border py-2 text-center text-sm font-medium text-muted-foreground">
                    {sub?.status === 'canceled' ? 'Ends at period end' : 'Your plan'}
                  </div>
                ) : tier.priceIdr === 0 ? (
                  <button
                    onClick={downgradeToFree}
                    disabled={busyTier !== null || !data || sub?.status === 'canceled'}
                    className="mt-5 rounded-md border border-border py-2 text-center text-sm font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
                  >
                    {busyTier === 'free'
                      ? 'Downgrading…'
                      : sub?.status === 'canceled'
                        ? 'Scheduled at period end'
                        : 'Downgrade to Free'}
                  </button>
                ) : (
                  <button
                    onClick={() => upgrade(tier.id)}
                    disabled={busyTier !== null || !data}
                    className="mt-5 rounded-md bg-primary py-2 text-center text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
                  >
                    {busyTier === tier.id
                      ? 'Redirecting…'
                      : `${tierRank(tier.id) < tierRank(currentTier) ? 'Downgrade' : 'Upgrade'} to ${tier.name}`}
                  </button>
                )}
              </div>
            );
          })}
          {!data &&
            !error &&
            [0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-72 animate-pulse rounded-xl border border-border bg-muted/40"
              />
            ))}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Payments are processed by Plugipay (QRIS, virtual account, e-wallet, card). Your outlets,
        catalog and sales stay yours on every tier, paid or not.
      </p>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={<div className="mx-auto max-w-5xl text-sm text-muted-foreground">Loading…</div>}
    >
      <BillingContent />
    </Suspense>
  );
}
