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
 *   create (single + batch)  ONE "New X" header button
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

/** A file's CODE, with comments stripped. A sweep for a banned label
 *  that greps raw source fires on the very comment explaining why the
 *  thing was removed — and then passes or fails on where the sentence
 *  happens to wrap. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('zero sparkles — the entry-point contract', () => {
  /**
   * ONE "New X", never a split (bang, 2026-08-14: *"why every new
   * button got dropdown which show redundant new x and bulk new x…
   * just lose the dropdown and separate bulk button if the form is
   * exactly the same"*).
   *
   * It was a split button whose chevron offered "New {noun}" and "Bulk
   * new {noun}s" — two menu items that both ran `setOpen(true)` on the
   * same create sheet, because that sheet's Manual tab has always taken
   * a single record OR a whole batch. The batch path is not a second
   * entry point; it is the same form.
   */
  it('no entry point offers a second way into the same create sheet', () => {
    const offenders = files.filter((f) => /Bulk new |More ways to add /.test(code(f)));
    expect(offenders, 'the chevron menu is gone — one button opens the one form').toEqual([]);
  });

  it('AgenticEntry renders a plain button, with no menu attached', () => {
    const src = readFileSync(join(SRC, 'components/catentio/agentic-entry.tsx'), 'utf8');
    expect(src, 'the split trigger is a DropdownMenu — it must be gone').not.toMatch(
      /DropdownMenu|ChevronDown/,
    );
    // Positive control for the read itself: this IS the entry file.
    expect(src).toMatch(/export function AgenticEntry/);
  });

  it('no page still passes a `split` prop', () => {
    // `split` is not a prop any more, so a page still passing it fails
    // to compile; this catches it in review, and names the file.
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<AgenticEntry\b([\s\S]*?)>/g)) {
        if (/^\s*split\s*$/m.test(m[1] ?? '')) return true;
      }
      return false;
    });
    expect(offenders, '`split` was removed with the chevron').toEqual([]);
  });

  it('the sweep reads CODE — the comment explaining the removal is not a hit', () => {
    // Load-bearing control for `code()`. agentic-entry.tsx's doc comment
    // quotes the very labels the sweep bans (that is what the comment is
    // FOR), so without stripping the guard would fail on the explanation
    // — or, worse, pass only because of where the sentence wraps.
    const entry = join(SRC, 'components/catentio/agentic-entry.tsx');
    expect(readFileSync(entry, 'utf8'), 'the doc comment should still explain the removal').toMatch(
      /Bulk new/,
    );
    expect(code(entry), 'and the stripped code must not carry it').not.toMatch(/Bulk new/);
    expect(code(entry)).toMatch(/export function AgenticEntry/);
  });

  it('the pages carrying a header create are actually being scanned', () => {
    const withEntry = files.filter((f) => /<AgenticEntry\b/.test(code(f)));
    expect(withEntry.length).toBeGreaterThan(10);
  });

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

  it('every batch item wears an icon — the icon follows the ACTION', () => {
    // Same rule the row entries live under (catentio-entry-icons):
    // what the item DOES is what the merchant reads off it. Count the
    // `key:`/`icon:` pairs inside each page's pageActions block — it
    // runs from the declaration to the JSX that mounts the dropdown.
    const offenders: string[] = [];
    for (const rel of surfaces) {
      const src = readFileSync(join(SRC, rel), 'utf8');
      const from = src.indexOf('const pageActions');
      const to = src.indexOf('<ActionsDropdown', from);
      expect(from, `${rel}: no pageActions block`).toBeGreaterThan(-1);
      expect(to, `${rel}: pageActions must be declared before the mount`).toBeGreaterThan(from);
      const block = src.slice(from, to);
      const keys = block.match(/\bkey: '/g)?.length ?? 0;
      const icons = block.match(/\bicon: /g)?.length ?? 0;
      if (keys === 0 || keys !== icons) offenders.push(`${rel}: ${keys} items, ${icons} icons`);
    }
    expect(offenders, 'these batch items render a bare word with no icon').toEqual([]);
  });

  /**
   * WAVE 2 — a declared verb's batch item opens the agentic verb sheet
   * (BulkVerbSlot) when the assistant is on, and falls back to the
   * page's own manual dialog when it is off. A page offering the verb
   * without mounting the slot is a dropdown item that opens nothing.
   */
  const agenticBatchSurfaces = [
    'app/(dashboard)/dashboard/products/page.tsx',
    'app/(dashboard)/dashboard/categories/page.tsx',
    'app/(dashboard)/dashboard/customers/page.tsx',
    'app/(dashboard)/dashboard/webhooks/page.tsx',
    'app/(dashboard)/dashboard/marketing/blog/page.tsx',
    'app/(dashboard)/dashboard/marketing/affiliate-approvals/page.tsx',
  ];

  it.each(agenticBatchSurfaces)('%s mounts BulkVerbSlot behind the assistant flag', (rel) => {
    const src = readFileSync(join(SRC, rel), 'utf8');
    expect(src).toMatch(/<BulkVerbSlot/);
    // …and keeps the assistant-off path: the hand-built confirm is
    // still mounted, never replaced.
    expect(src).toMatch(/<(BulkDeleteDialog|BulkActionDialog|Dialog)\b/);
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
