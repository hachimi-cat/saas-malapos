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
 *
 * ONE exception, carved out by bang on 2026-08-14: *"for page that
 * directly rendered form like ... payment providers, payment method,
 * payment template ..., for the action item, instead of using action
 * keyword like edit, you can use ask assistant with sparkle icon. this
 * is only for page with open form"*.
 *
 * It is not a reversal. The 08-12 rule says name a button after its
 * ACTION — and on a singleton settings page there is no action to name:
 * the form is already open, every field is on screen, the page has its
 * own Save, and "Edit" reveals nothing. The only thing the button
 * offers is the assistant, so the honest label IS the mechanism.
 *
 * So the sweeps below are NARROWED, not dropped:
 *   - the label + the icon may appear in exactly ONE file, the entry
 *     component that owns them;
 *   - only OPEN_FORM_SURFACES may mount <AskAssistantEntry, and all of
 *     them must (asserted both ways).
 * Both halves carry a positive control, so deleting the feature cannot
 * make a sweep pass on an absence.
 */

/** The pages that ARE the form. Exhaustive, and asserted both ways. */
const OPEN_FORM_SURFACES = [
  'app/(dashboard)/dashboard/payments/settings/providers/page.tsx',
  'app/(dashboard)/dashboard/payments/settings/payment-methods/page.tsx',
  'app/(dashboard)/dashboard/payments/settings/templates/page.tsx',
  // bang, 2026-08-14, naming them for BOTH products: *"marketing > pixel
  // and tracking … edit action instead of ask assistant"*, and the same
  // for abandoned cart, loyalty program and referrals. storlaunch got
  // them in bc61a59; these are the malapos halves. Each carried an
  // `AgenticSheetSlot mode="edit"` behind a Pencil labelled "Edit".
  'app/(dashboard)/dashboard/marketing/pixels/page.tsx',
  'app/(dashboard)/dashboard/marketing/abandoned-cart/page.tsx',
  'app/(dashboard)/dashboard/marketing/referrals/page.tsx',
  'app/(dashboard)/dashboard/marketing/loyalty/page.tsx',
  // *"malapos: fulfillment shipping page doesn't have ask assistant
  // button"* — this one had no entry at all, not the wrong one.
  'app/(dashboard)/dashboard/fulfillment/shipping/page.tsx',
  // Consultative entries, 2026-08-15. Not single-record forms, but
  // bang asked for the same agent-only sheet on them: *"it should
  // open the agentic sheet without the manual input"*. Each keeps
  // its own manual path on the page — the provider cards on
  // channels, the composer itself, the per-card Invite on creators.
  'app/(dashboard)/dashboard/marketing/channels/page.tsx',
  'app/(dashboard)/dashboard/marketing/compose/page.tsx',
  'app/(dashboard)/dashboard/marketing/creators/page.tsx',
];

/** The one file allowed to spell the label and import the icon. */
const SPARKLE_OWNER = 'components/catentio/agentic-entry.tsx';

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

  it('the "Ask assistant" label lives in exactly one file', () => {
    // Read CODE, not raw source: this file's own doc comment quotes the
    // label, and so does the entry component's.
    const offenders = files.filter(
      (f) => code(f).includes('Ask assistant') && !f.endsWith(join(...SPARKLE_OWNER.split('/'))),
    );
    expect(
      offenders,
      'every other entry is an action button — the label is the verb, never the mechanism',
    ).toEqual([]);
    // Positive control: the owner really does carry it. Without this the
    // sweep passes just as happily if the feature were deleted.
    expect(code(join(SRC, SPARKLE_OWNER))).toContain('Ask assistant');
  });

  it('the Sparkles icon lives in exactly one file', () => {
    const offenders = files.filter(
      (f) => /\bSparkles\b/.test(code(f)) && !f.endsWith(join(...SPARKLE_OWNER.split('/'))),
    );
    expect(offenders, 'no sparkle on any other surface — decorative ones included').toEqual([]);
    expect(code(join(SRC, SPARKLE_OWNER))).toMatch(/\bSparkles\b/);
  });

  it('only the open-form pages mount AskAssistantEntry — and all of them do', () => {
    const mounted = files
      .filter((f) => /<AskAssistantEntry\b/.test(code(f)))
      .map((f) => f.slice(SRC.length + 1).split(/[\\/]/).join('/'))
      .sort();
    // Both directions. `toEqual` one way alone would let a page grow a
    // sparkle over a list (an entry point the 08-12 rule bans), and the
    // other way alone would let one of the three silently lose it.
    expect(mounted, 'the sparkle is only for a page that IS the form').toEqual(
      [...OPEN_FORM_SURFACES].sort(),
    );
  });

  it('a page with a sparkle has NO manual twin behind it', () => {
    // bang, 2026-08-14: *"for page with ask assistant button, no need to
    // show manual form. it will only show agentic mode."* The sheet is
    // opened with `agentOnly`, which does not merely hide the Manual
    // pane — the package leaves it UNMOUNTED, so a form nobody can see
    // cannot seed the shared draft and quietly overrule the plan.
    const owner = code(join(SRC, SPARKLE_OWNER));
    expect(owner, 'AskAssistantEntry must open the sheet agent-only').toMatch(
      /<CatentioCrudSheet[\s\S]*?\bagentOnly\b[\s\S]*?\/>/,
    );
    // …and the sheet has to actually forward it.
    const sheet = code(join(SRC, 'components/catentio/agentic-sheet.tsx'));
    expect(sheet, 'CatentioCrudSheet must pass agentOnly through').toMatch(
      /agentOnly=\{agentOnly\}/,
    );
  });

  /**
   * The element's attributes, brace-aware.
   *
   * A non-greedy `/<AgenticSheetSlot([\s\S]*?)>/` stops at the first `>`
   * — and `initial={form as unknown as Record<string, unknown>}` holds
   * one, so every slot carrying a generic type reads as having no
   * attributes past it. On storlaunch the first version of this guard
   * passed on a page it should have failed; that was found by
   * red-check, not by review.
   */
  function slotAttrs(src: string): string[] {
    const out: string[] = [];
    for (const m of src.matchAll(/<AgenticSheetSlot\b/g)) {
      let depth = 0;
      for (let i = m.index! + '<AgenticSheetSlot'.length; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        else if (ch === '>' && depth === 0) {
          out.push(src.slice(m.index!, i));
          break;
        }
      }
    }
    return out;
  }

  it('no open-form page offers an Edit action', () => {
    // The complement of the mount sweep above. That one proves the
    // sparkle is THERE; this one proves the "Edit" button it replaced is
    // GONE — a page could mount both and satisfy the other test alone.
    //
    // Scoped to OPEN_FORM_SURFACES and to `mode="edit"` deliberately. A
    // CREATE slot beside a form is a real action with a real name, and
    // `mode="edit"` elsewhere is fine: a DETAIL page whose manual path
    // lives on another screen is exactly where naming the action is
    // right, per bang's 08-12 ban. What he objected to is an "Edit"
    // button on a form that is already open.
    const offenders = OPEN_FORM_SURFACES.filter((rel) =>
      slotAttrs(code(join(SRC, rel))).some((a) => /mode="edit"/.test(a)),
    );
    expect(
      offenders,
      'the page IS the form — use <AskAssistantEntry>, not an Edit action',
    ).toEqual([]);
  });

  it('positive control: the brace-aware scan sees a generic-typed slot', () => {
    // Without this, the guard above could pass because `slotAttrs`
    // silently returned nothing — an absence reading as a clean result.
    // This is the exact shape the four malapos pages carried.
    const sample = `<AgenticSheetSlot
        resource="pixels"
        mode="edit"
        initial={form as unknown as Record<string, unknown>}
      />`;
    expect(slotAttrs(sample)).toHaveLength(1);
    expect(slotAttrs(sample)[0]).toContain('mode="edit"');
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
