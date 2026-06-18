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

export const BILLING_TIERS = ['free', 'starter', 'growth', 'business'] as const;
export type BillingTier = (typeof BILLING_TIERS)[number];

/** Early access: no plan is charged yet; the pricing page shows a banner. */
export const EARLY_ACCESS = true;

export interface TierDef {
  id: BillingTier;
  name: string;
  /** Whole rupiah per month. 0 = free. Free during early access. */
  priceIdr: number;
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
      'Up to 50 products',
      'Sell screen — cash, QRIS & card',
      'Printed & shareable receipts',
      'Daily sales report',
      '2 cashier seats',
      'Malapos branding on receipts',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    priceIdr: 99_000,
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
      'Unlimited outlets',
      '50 cashier seats',
      'Priority support',
    ],
  },
];

export function tierDef(id: BillingTier): TierDef {
  return TIER_DEFS.find((t) => t.id === id) ?? TIER_DEFS[0]!;
}
