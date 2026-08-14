import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RESOURCE_EXTRA_ACTIONS } from '@/components/catentio/capabilities';

/**
 * Batch coverage across the payments / fulfillment / marketing modules
 * (bang, 2026-08-14: *"please check all malapos module … they might
 * don't have any recent composition of bulk new, bulk actions, and
 * agentic bulk new and bulk actions"*).
 *
 * The audit found malapos already in good shape — warehouses, plans,
 * payment-customers, blog, campaigns, discount-codes and funnels all
 * carry the full set, and affiliate-approvals has its own. ONE page
 * declared a batch verb and offered no way to reach it: payouts.
 *
 * What this file guards is the pairing that silently rots — a resource
 * that DECLARES a verb but has no batch surface, or a page that offers
 * one the profile never declared (an undeclared verb renders a card the
 * sanitizer drops, so the sheet opens, Apply is pressed, and nothing
 * happens).
 */

const DASH = join(__dirname, '..', '..', 'app', '(dashboard)', 'dashboard');
const read = (rel: string) => readFileSync(join(DASH, rel), 'utf8');

const BATCH_PAGES = [
  {
    file: 'payments/payouts/page.tsx',
    resource: 'payouts',
    // malapos declares exactly ONE payout verb, unlike storlaunch's
    // four — so this is a single action item, and the guard below
    // asserts the declaration rather than assuming a shape.
    batched: ['mark-paid'],
  },
  { file: 'payments/plans/page.tsx', resource: 'plans', batched: ['delete'] },
  { file: 'fulfillment/warehouses/page.tsx', resource: 'warehouses', batched: ['delete'] },
  { file: 'marketing/funnels/page.tsx', resource: 'funnels', batched: ['delete'] },
  {
    file: 'marketing/discount-codes/page.tsx',
    resource: 'discount-codes',
    batched: ['delete'],
  },
] as const;

describe('module batch coverage', () => {
  it.each(BATCH_PAGES.map((p) => [p.file, p] as const))(
    '%s: has a selection surface wired to the Actions dropdown',
    (_name, spec) => {
      const src = read(spec.file);
      expect(src, 'nothing turns row selection on').toMatch(
        /renderBulkBar|<Checkbox|onSelectionChange/,
      );
      expect(src, 'no Actions dropdown to run a verb from').toContain('<ActionsDropdown');
      expect(src, 'no batch sheet to review the verb in').toMatch(
        /<BulkVerbSlot|<BulkEditSlot|CatentioBulkVerbSheet/,
      );
    },
  );

  it.each(BATCH_PAGES.map((p) => [p.file, p] as const))(
    '%s: every batched verb is DECLARED',
    (_name, spec) => {
      const declared = RESOURCE_EXTRA_ACTIONS[spec.resource] ?? [];
      for (const verb of spec.batched) {
        expect(
          declared,
          `${spec.resource} does not declare "${verb}" — the sanitizer drops the card and Apply does nothing`,
        ).toContain(verb);
      }
    },
  );

  it('payouts offers its one declared verb as a batch action', () => {
    // The gap bang found. Named explicitly because it is the regression
    // most likely to be undone: the row button looks like coverage.
    const src = read('payments/payouts/page.tsx');
    expect(src, 'mark-paid is not offered as a batch action').toContain("key: 'mark-paid'");
    expect(src, 'the per-row verb must remain too').toContain('mode="mark-paid"');
  });

  it('the check discriminates — a read-only page has none of it', () => {
    // Positive control. Without this, a typo'd path or a predicate that
    // matched everything would let the file above pass on any input.
    const src = read('payments/ledger/page.tsx');
    expect(src).not.toContain('<ActionsDropdown');
    expect(src).not.toContain('<BulkVerbSlot');
  });

  it('no page offers a batch verb its resource never declared', () => {
    // The other direction, and the quieter failure: a card that renders
    // and then does nothing on Apply.
    for (const { file, resource, batched } of BATCH_PAGES) {
      const src = read(file);
      const declared = RESOURCE_EXTRA_ACTIONS[resource] ?? [];
      for (const verb of batched) {
        if (src.includes(`key: '${verb}'`)) {
          expect(declared, `${file} offers "${verb}" undeclared`).toContain(verb);
        }
      }
    }
  });
});
