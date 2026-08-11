import { describe, expect, it } from 'vitest';
import {
  BILLING_TIERS,
  TIER_DEFS,
  isPaidTier,
  resolveBillingCurrency,
  tierDef,
} from '../lib/billing.js';

/*
 * The USD rail (Phase 8). Two invariants guarded here:
 *
 * 1. resolveBillingCurrency — the explicit buyer preference always wins
 *    over the geo-route, and every "we don't know where you are" case
 *    lands on IDR, the home market. Getting this wrong charges cents
 *    where rupiah were shown (~160x apart).
 * 2. The tier table itself — every paid tier must carry a positive USD
 *    price (the checkout refuses USD without one), and the advertised
 *    agentCredits must equal what the CP actually grants through
 *    routes/catentio.ts grantPlan() (free→50, starter/growth→PRO 500,
 *    business→1200). If this test breaks because the CP table moved,
 *    move BOTH sides.
 */

describe('resolveBillingCurrency', () => {
  it('explicit USD wins even from Indonesia', () => {
    expect(resolveBillingCurrency('USD', 'ID')).toBe('USD');
  });

  it('explicit IDR wins even from abroad', () => {
    expect(resolveBillingCurrency('IDR', 'US')).toBe('IDR');
  });

  it('is case/whitespace tolerant on the explicit value', () => {
    expect(resolveBillingCurrency(' usd ', 'ID')).toBe('USD');
    expect(resolveBillingCurrency('idr', 'DE')).toBe('IDR');
  });

  it('an unrecognised explicit value falls through to the geo-route, never silently changes currency', () => {
    expect(resolveBillingCurrency('EUR', 'ID')).toBe('IDR');
    expect(resolveBillingCurrency('EUR', 'US')).toBe('USD');
  });

  it('geo-routes: ID → IDR, anywhere real → USD', () => {
    expect(resolveBillingCurrency(undefined, 'ID')).toBe('IDR');
    expect(resolveBillingCurrency(undefined, 'US')).toBe('USD');
    expect(resolveBillingCurrency(undefined, 'SG')).toBe('USD');
  });

  it("Cloudflare's unknown markers and an absent header default to IDR", () => {
    expect(resolveBillingCurrency(undefined, 'XX')).toBe('IDR');
    expect(resolveBillingCurrency(undefined, 'T1')).toBe('IDR');
    expect(resolveBillingCurrency(undefined, undefined)).toBe('IDR');
    expect(resolveBillingCurrency(undefined, '')).toBe('IDR');
  });
});

describe('tier table USD prices + credit grants', () => {
  it('every paid tier has a positive USD price; free has none', () => {
    for (const id of BILLING_TIERS) {
      const def = tierDef(id);
      if (isPaidTier(id)) {
        expect(def.priceUsdCents, `${id} priceUsdCents`).toBeGreaterThan(0);
      } else {
        expect(def.priceUsdCents, `${id} priceUsdCents`).toBe(0);
      }
    }
  });

  it('advertised agentCredits match the CP grant through grantPlan()', () => {
    // grantPlan(): free→FREE, business→BUSINESS, else→PRO; CP default
    // table: FREE 50 / PRO 500 / BUSINESS 1200.
    const expected: Record<string, number> = {
      free: 50,
      starter: 500,
      growth: 500,
      business: 1_200,
    };
    for (const def of TIER_DEFS) {
      expect(def.agentCredits, `${def.id} agentCredits`).toBe(expected[def.id]);
    }
  });

  it('every tier states its credit grant in the marketing bullets', () => {
    for (const def of TIER_DEFS) {
      const line = def.features.find((f) => f.includes('assistant credits/mo'));
      expect(line, `${def.id} features`).toBeDefined();
      expect(line).toContain(`${def.agentCredits.toLocaleString('en-US')} assistant credits/mo`);
    }
  });
});
