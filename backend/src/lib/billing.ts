/*
 * Malapos billing tiers — the SINGLE SOURCE OF TRUTH for plan limits +
 * marketing bullets. Three mirrors stay in sync:
 *   TIER_DEFS  ↔  the /pricing page lists + comparison table  ↔  (future)
 *   the dashboard billing card, which reads GET /api/v1/billing/tiers
 *   (never a 4th hand-kept copy).
 *
 * HONESTY: every feature line below maps to a SHIPPED capability in this
 * repo. Limits are PLAN TERMS displayed against live usage — enforcement
 * (403 LIMIT_REACHED) lands when paid plans launch; until then Malapos is
 * in early access and everything is free (see EARLY_ACCESS + the pricing
 * page banner). No line promises an unbuilt feature.
 *
 * Pricing is per-workspace flat monthly IDR (beats per-seat for ID SMEs).
 * The displayed amounts are launch proposals, free during early access.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { newId } from './ids.js';
import { writeOutbox } from './outbox.js';

export const BILLING_TIERS = ['free', 'starter', 'growth', 'business'] as const;
export type BillingTier = (typeof BILLING_TIERS)[number];

/** Paid launch (2026-06-18): plans are live and charged via Plugipay.
 *  Flipping this back to `true` reverts to free-for-all + no checkout +
 *  no limit enforcement (see entitlements.ts + the dashboard billing
 *  card, both of which read `earlyAccess` from GET /billing). */
export const EARLY_ACCESS = false;

export interface TierDef {
  id: BillingTier;
  name: string;
  /** Whole rupiah per month. 0 = free. Free during early access. */
  priceIdr: number;
  /** US cents per month for international buyers (PayPal rail). Clean
   *  USD amounts at ~Rp 14-16k/USD — hedges against IDR/USD drift.
   *  These were first hand-typed on the /pricing + home pages; the
   *  backend copy is now the source of truth and the pages mirror it. */
  priceUsdCents: number;
  /** Monthly assistant-credit grant bundled with the tier. The grant is
   *  applied by catentio's control plane (PLAN_MONTHLY_GRANT_CREDITS,
   *  keyed through grantPlan() in routes/catentio.ts: free→FREE 50,
   *  starter/growth→PRO 500, business→BUSINESS 1200). Malapos cannot
   *  mint credits — this number exists so the cards and the pricing
   *  page can STATE the grant a buyer receives. KEEP IN STEP WITH THE
   *  CP: if either side moves alone, the cards advertise a grant nobody
   *  receives. */
  agentCredits: number;
  blurb: string;
  /** Outlets (store locations) — maps to the Outlet model + /outlets. */
  outletLimit: number; // Infinity-safe: use a big sentinel for "unlimited"
  /** Cashier/staff seats — Huudis workspace members. */
  memberLimit: number;
  /** Catalog size — Product rows. */
  productLimit: number;
  /** Stock tracking: levels, movements ledger, low-stock alerts, adjustments. */
  inventory: boolean;
  /** Multiple outlets + inter-outlet stock transfers. */
  multiOutlet: boolean;
  /** Customer directory + loyalty points. */
  loyalty: boolean;
  /** Suppliers + purchase orders (receive → stock-in). */
  purchasing: boolean;
  /** Pharmacy: dated batches, FEFO sell, expiry alerts. */
  batchTracking: boolean;
  /** Hide "Powered by Malapos" on printed/shared receipts. */
  brandingRemoval: boolean;
  /** Priority support SLA via the Suppuo help center. */
  prioritySupport: boolean;
  /** Marketing bullets — mirrored on /pricing. */
  features: string[];
}

const UNLIMITED = 1_000_000;
export function isUnlimited(n: number): boolean {
  return n >= UNLIMITED;
}

export const TIER_DEFS: readonly TierDef[] = [
  {
    id: 'free',
    name: 'Free',
    priceIdr: 0,
    priceUsdCents: 0,
    agentCredits: 50,
    outletLimit: 1,
    memberLimit: 2,
    productLimit: 50,
    inventory: false,
    multiOutlet: false,
    loyalty: false,
    purchasing: false,
    batchTracking: false,
    brandingRemoval: false,
    prioritySupport: false,
    blurb: 'For a single counter getting started.',
    features: [
      '1 outlet',
      '50 assistant credits/mo',
      'Up to 50 products',
      'Sell screen — cash, QRIS, card & transfer',
      'Counter, dine-in, takeaway & delivery',
      'Kitchen display & expo (F&B)',
      'Gift cards, store credit & refunds',
      'Printed & shareable receipts',
      'Developer API + webhooks',
      'Daily sales report',
      '2 cashier seats',
      'Malapos branding on receipts',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    priceIdr: 99_000,
    priceUsdCents: 700, // $7
    agentCredits: 500,
    outletLimit: 1,
    memberLimit: 5,
    productLimit: UNLIMITED,
    inventory: true,
    multiOutlet: false,
    loyalty: true,
    purchasing: false,
    batchTracking: false,
    brandingRemoval: true,
    prioritySupport: false,
    blurb: 'For one busy store that needs stock + customers.',
    features: [
      'Everything in Free',
      '500 assistant credits/mo',
      'Unlimited products',
      'Inventory tracking + low-stock alerts',
      'Cashier shifts + cash reconciliation',
      'Customers + loyalty points',
      'Full sales reports (by day, top products, payment mix)',
      'Hide Malapos branding',
      '5 cashier seats',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    priceIdr: 199_000,
    priceUsdCents: 1_400, // $14
    agentCredits: 500,
    outletLimit: 5,
    memberLimit: 15,
    productLimit: UNLIMITED,
    inventory: true,
    multiOutlet: true,
    loyalty: true,
    purchasing: true,
    batchTracking: true,
    brandingRemoval: true,
    prioritySupport: false,
    blurb: 'For multi-outlet retail, F&B & pharmacy.',
    features: [
      'Everything in Starter',
      '500 assistant credits/mo',
      'Up to 5 outlets + stock transfers',
      'Suppliers + purchase orders',
      'Batch & expiry tracking (pharmacy)',
      '15 cashier seats',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    priceIdr: 449_000,
    priceUsdCents: 3_000, // $30
    agentCredits: 1_200,
    outletLimit: UNLIMITED,
    memberLimit: 50,
    productLimit: UNLIMITED,
    inventory: true,
    multiOutlet: true,
    loyalty: true,
    purchasing: true,
    batchTracking: true,
    brandingRemoval: true,
    prioritySupport: true,
    blurb: 'For chains running many outlets.',
    features: [
      'Everything in Growth',
      '1,200 assistant credits/mo',
      'Unlimited outlets',
      '50 cashier seats',
      'Priority support',
    ],
  },
];

export function tierDef(id: BillingTier): TierDef {
  return TIER_DEFS.find((t) => t.id === id) ?? TIER_DEFS[0]!;
}

// ─────────────────────────────────────────────────────────────
// Plugipay-backed plan lifecycle. Ported from serront's billing
// glue, trimmed to Malapos's OWN-tier subscription (no per-seller
// reseller flow). The BillingSubscription row is written ONLY by the
// `plugipay.checkout_session.completed.v1` webhook — checkout creation
// just stamps {accountId, tier} metadata. Absence of a row = free.
// ─────────────────────────────────────────────────────────────

export function isBillingTier(v: unknown): v is BillingTier {
  return typeof v === 'string' && (BILLING_TIERS as readonly string[]).includes(v);
}

/** Paid tiers need a Plugipay checkout; free never does. */
export function isPaidTier(tier: BillingTier): boolean {
  return tierDef(tier).priceIdr > 0;
}

export type BillingCurrency = 'IDR' | 'USD';

/**
 * The currency a checkout bills in (storlaunch's geo-route, transcribed).
 * An explicit choice from the caller wins — it is the account-wide
 * preference the buyer set, and the invoice must match what the pricing
 * page showed them. With no explicit choice, CF-IPCountry decides:
 * ID → IDR rails (QRIS/VA/e-wallet/card), anywhere else → USD via
 * PayPal (PayPal cannot settle IDR — it must never appear on an IDR
 * session). 'XX'/'T1' are Cloudflare's unknown/Tor markers, and an
 * absent header means no Cloudflare at all (staging) — all default IDR,
 * the home market.
 */
export function resolveBillingCurrency(
  explicit: unknown,
  cfCountry: unknown,
): BillingCurrency {
  const want = String(explicit ?? '').trim().toUpperCase();
  if (want === 'USD') return 'USD';
  if (want === 'IDR') return 'IDR';
  const cc = String(cfCountry ?? '').trim().toUpperCase();
  return cc && cc !== 'ID' && cc !== 'XX' && cc !== 'T1' ? 'USD' : 'IDR';
}

// ─────────────────────────────────────────────────────────────
// Partner-module tier gate. Mirrors storlaunch's tier-limits
// isModuleAllowedForTier: Free unlocks NO partner modules; every paid
// tier (starter/growth/business) unlocks all three (payment/Plugipay,
// fulfillment/Fulkruma, marketing/Ripllo). Keep MODULE_KEYS in sync
// with the WHITELIST in routes/modules.ts + the MODULES array in the
// frontend settings/modules page.
// ─────────────────────────────────────────────────────────────

export const MODULE_KEYS = ['payment', 'fulfillment', 'marketing'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

/** The partner modules a tier may enable. Free → none; any paid tier
 *  → all three (gated on `priceIdr > 0` so a future paid tier unlocks
 *  modules automatically). */
export function modulesAllowedForTier(tier: BillingTier): readonly ModuleKey[] {
  return isPaidTier(tier) ? MODULE_KEYS : [];
}

export function isModuleAllowedForTier(tier: BillingTier, module: ModuleKey): boolean {
  return modulesAllowedForTier(tier).includes(module);
}

interface SubscriptionLike {
  tier: string;
  status: string;
  currentPeriodEnd: Date | null;
}

/** The tier the workspace is actually entitled to right now. A
 *  'canceled' row keeps the paid period's entitlement then lapses to
 *  free (no refunds, no auto-renew — they keep what they bought). A
 *  lapsed period, an unknown status, or an unknown tier id → free. */
export function effectiveTier(
  sub: SubscriptionLike | null | undefined,
  now = new Date(),
): BillingTier {
  if (!sub) return 'free';
  if (sub.status !== 'active' && sub.status !== 'canceled') return 'free';
  if (sub.status === 'canceled' && !sub.currentPeriodEnd) return 'free';
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < now.getTime()) return 'free';
  if (!isBillingTier(sub.tier)) return 'free';
  return sub.tier;
}

/** Generic limit check against a tier's numeric cap (outlets,
 *  products, members). `currentCount` is the existing row count; the
 *  call is allowed when it's strictly below the cap. UNLIMITED tiers
 *  always pass (the sentinel is well above any real count). */
export function checkLimit(
  tier: BillingTier,
  field: 'outletLimit' | 'productLimit' | 'memberLimit',
  currentCount: number,
): { allowed: boolean; limit: number } {
  const limit = tierDef(tier)[field];
  return { allowed: currentCount < limit, limit };
}

/** Read the {accountId, tier} a paid checkout session was created
 *  with. Returns null unless it names a workspace AND a PAID tier
 *  (free is never purchased — absence of a row IS free). */
export function parseCheckoutMetadata(
  metadata: Record<string, unknown> | null | undefined,
): { accountId: string; tier: BillingTier } | null {
  const md = metadata ?? {};
  const accountId = typeof md.accountId === 'string' ? md.accountId.trim() : '';
  const tier = md.tier;
  if (!accountId || !isBillingTier(tier) || !isPaidTier(tier)) return null;
  return { accountId, tier };
}

/** Each completed checkout buys this many days (v1 has no recurring
 *  charge — the buyer re-checks-out to renew). */
export const PERIOD_DAYS = 30;

type BillingDb = PrismaClient | Prisma.TransactionClient;

/** Activate (or extend) a workspace's subscription from a completed
 *  Plugipay checkout. Idempotent on the checkout-session id (Plugipay
 *  retries deliveries); guard + upsert + outbox share one transaction
 *  (ADR-0006). */
export async function applyCheckoutCompleted(
  db: BillingDb,
  input: { sessionId: string; accountId: string; tier: BillingTier },
): Promise<'applied' | 'duplicate'> {
  return (db as PrismaClient).$transaction(async (tx) => {
    const dup = await tx.billingSubscription.findFirst({
      where: { plugipayCheckoutSessionId: input.sessionId },
      select: { id: true },
    });
    if (dup) return 'duplicate' as const;

    const currentPeriodEnd = new Date(Date.now() + PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const sub = await tx.billingSubscription.upsert({
      where: { accountId: input.accountId },
      create: {
        id: newId('bsub'),
        accountId: input.accountId,
        tier: input.tier,
        status: 'active',
        plugipayCheckoutSessionId: input.sessionId,
        currentPeriodEnd,
      },
      update: {
        tier: input.tier,
        status: 'active',
        plugipayCheckoutSessionId: input.sessionId,
        currentPeriodEnd,
      },
    });
    await writeOutbox(tx, {
      type: 'malapos.billing.subscribed.v1',
      accountId: input.accountId,
      aggregateId: sub.id,
      data: {
        subscriptionId: sub.id,
        tier: input.tier,
        plugipayCheckoutSessionId: input.sessionId,
        currentPeriodEnd: currentPeriodEnd.toISOString(),
      },
    });
    return 'applied' as const;
  });
}
