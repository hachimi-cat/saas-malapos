import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ZERO sparkles (bang's P1 entry-point contract, 2026-08-12 — ported
 * from storlaunch's zero-sparkle-entry-points guard).
 *
 * The page-level assistant button is gone entirely: every entry point
 * is an ACTION button now —
 *
 *   create (single + batch)  "New X" header button (split on BULK)
 *   single verbs             row buttons / detail-page buttons
 *   batch verbs              ActionsDropdown BESIDE "New X"
 *
 * so nothing on a dashboard page may say "Ask assistant", mount a
 * `PageAssistant`, or wear a Sparkles icon. Decorative sparkles are
 * banned with the rest — a sparkle anywhere reads as "assistant lives
 * here", which is exactly the affordance this rework removed.
 */

const SRC = join(__dirname, '..', '..');
const SCANNED = [join(SRC, 'app'), join(SRC, 'components')];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

const files = SCANNED.flatMap((d) => walk(d));

function pageFiles(): string[] {
  return files.filter((f) => f.endsWith('page.tsx'));
}

describe('zero sparkles — the entry-point contract', () => {
  it('finds the dashboard pages at all (guards the walk itself)', () => {
    const pages = pageFiles();
    expect(pages.length).toBeGreaterThan(20);
    expect(pages.some((f) => f.includes('payments'))).toBe(true);
  });

  it('no PageAssistant survives anywhere', () => {
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes('PageAssistant'));
    expect(offenders, 'PageAssistant was deleted with the picker — nothing may mount or define it').toEqual([]);
  });

  it('no "Ask assistant" label survives anywhere', () => {
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes('Ask assistant'));
    expect(offenders, 'entries are action buttons — the label is the verb, never the mechanism').toEqual([]);
  });

  it('no Sparkles icon survives anywhere', () => {
    const offenders = files.filter((f) => /\bSparkles\b/.test(readFileSync(f, 'utf8')));
    expect(offenders, 'no sparkle icon on any app/component surface — decorative ones included').toEqual([]);
  });
});

describe('batch verbs live on the Actions dropdown', () => {
  /**
   * Every surface with a batch action (bulk edit, batch delete, set
   * category, batch approve/void) mounts `ActionsDropdown` beside its
   * "New X". This list IS the contract for malapos — a page that gains
   * a batch action joins it; a page on it that loses its dropdown is a
   * regression.
   */
  const surfaces = [
    'app/(dashboard)/dashboard/products/page.tsx',
    'app/(dashboard)/dashboard/categories/page.tsx',
    'app/(dashboard)/dashboard/modifiers/page.tsx',
    'app/(dashboard)/dashboard/outlets/page.tsx',
    'app/(dashboard)/dashboard/tables/page.tsx',
    'app/(dashboard)/dashboard/customers/page.tsx',
    'app/(dashboard)/dashboard/webhooks/page.tsx',
    'app/(dashboard)/dashboard/purchasing/page.tsx',
    'app/(dashboard)/dashboard/fulfillment/warehouses/page.tsx',
    'app/(dashboard)/dashboard/marketing/blog/page.tsx',
    'app/(dashboard)/dashboard/marketing/campaigns/page.tsx',
    'app/(dashboard)/dashboard/marketing/discount-codes/page.tsx',
    'app/(dashboard)/dashboard/marketing/funnels/page.tsx',
    'app/(dashboard)/dashboard/marketing/affiliate-approvals/page.tsx',
    'app/(dashboard)/dashboard/payments/plans/page.tsx',
    'app/(dashboard)/dashboard/payments/customers/page.tsx',
  ];

  it.each(surfaces)('%s mounts ActionsDropdown', (rel) => {
    const src = readFileSync(join(SRC, rel), 'utf8');
    expect(src).toMatch(/<ActionsDropdown/);
  });

  it('every ActionsDropdown mount also slims its BulkBar (no verbs on the bar)', () => {
    // The bar is "{n} {noun} selected · Clear" + the partial-failure
    // alert line only. Its Edit/Delete props are gone from the
    // component, so any page still passing them fails to compile —
    // this guards the TEXTUAL shape too, for reviewers reading a page.
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      // Scan each <BulkBar …/> tag's own props only — the
      // BulkDeleteDialog mounted next to it legitimately takes
      // `onDelete`.
      for (const m of src.matchAll(/<BulkBar\b([\s\S]*?)\/>/g)) {
        if (/\b(onEdit|onDelete)=/.test(m[1] ?? '')) return true;
      }
      return false;
    });
    expect(offenders, 'bulk-bar verbs moved to the ActionsDropdown').toEqual([]);
  });
});
