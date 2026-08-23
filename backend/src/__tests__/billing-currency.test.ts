import { describe, expect, it } from 'vitest';
import {
  BILLING_TIERS,
  TIER_DEFS,
  USD_BILLING_ENABLED,
  isPaidTier,
  resolveBillingCurrency,
  tierDef,
} from '../lib/billing.js';

/*
 * The USD rail (Phase 8). Two invariants guarded here:
 *
 * 1. resolveBillingCurrency — SUSPENDED as of 2026-08-23. It used to let
 *    an explicit buyer preference beat the geo-route; with PayPal gone
 *    there is no rail behind a dollar price, so everything lands on IDR.
 *    Getting this wrong charges cents where rupiah were shown (~160x
 *    apart), which is exactly why it coerces rather than guesses.
 * 2. The tier table itself — every paid tier must carry a positive USD
 *    price (the checkout refuses USD without one), and the advertised
 *    agentCredits must equal what the CP actually grants through
 *    routes/catentio.ts grantPlan() (free→50, starter/growth→PRO 500,
 *    business→1200). If this test breaks because the CP table moved,
 *    move BOTH sides.
 */

describe('resolveBillingCurrency — while USD billing is suspended', () => {
  /*
   * PayPal was the only rail that could settle a USD charge, and PayPal
   * closed the account on 2026-08-23, so every route now lands on IDR no
   * matter what the buyer asked for or where they are. The
   * preference-then-geo logic still lives in the function behind
   * USD_BILLING_ENABLED — the assertions below flip back with it.
   */
  it('is suspended, and says so in one place', () => {
    expect(USD_BILLING_ENABLED).toBe(false);
  });

  it('coerces an explicit USD preference to IDR rather than honouring it', () => {
    // Was 'USD' before suspension — the buyer's own choice no longer wins,
    // because there is nothing behind it.
    expect(resolveBillingCurrency('USD', 'ID')).toBe('IDR');
    expect(resolveBillingCurrency(' usd ', 'US')).toBe('IDR');
  });

  it('no longer geo-routes anyone abroad to USD', () => {
    // Was 'USD' for both before suspension.
    expect(resolveBillingCurrency(undefined, 'US')).toBe('IDR');
    expect(resolveBillingCurrency(undefined, 'SG')).toBe('IDR');
    expect(resolveBillingCurrency('EUR', 'US')).toBe('IDR');
  });

  it('leaves every case that already resolved to IDR untouched', () => {
    expect(resolveBillingCurrency('IDR', 'US')).toBe('IDR');
    expect(resolveBillingCurrency('idr', 'DE')).toBe('IDR');
    expect(resolveBillingCurrency('EUR', 'ID')).toBe('IDR');
    expect(resolveBillingCurrency(undefined, 'ID')).toBe('IDR');
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
