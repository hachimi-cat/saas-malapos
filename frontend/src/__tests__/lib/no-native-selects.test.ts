import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No native `<select>` anywhere — the shadcn CONTROL rule, applied to
 * dropdowns.
 *
 * The sibling sweeps for checkboxes and dates have existed for a while.
 * There was never one for `<select>`, and that is precisely why this
 * regression survived: `components/marketing/campaign-select.tsx` was
 * migrated to shadcn's Select in storlaunch and MISSED here, so seven
 * malapos pages (programs, programs/[id], discount-codes, blog post
 * editor, abandoned-cart, feeds, referrals) rendered the OS dropdown
 * while their storlaunch twins rendered the shadcn one. Same component
 * name, same props, same file path, two different controls.
 *
 * A rule enforced in three products and one component is not enforced.
 * The sweep is the enforcement; the fix without it just resets the clock.
 *
 * The replacement is components/ui/select.tsx. Note the value mapping:
 * Radix forbids an empty-string item value, so "no campaign" travels as
 * the sentinel 'none' and is converted back to null at the boundary —
 * the component's `value: string | null` / `onChange(id: string | null)`
 * contract is unchanged, which is why no caller needed touching.
 */

const SRC = join(__dirname, '..', '..');
// The whole of src/, not just app/ + components/. The sibling sweeps
// scan those two directories only, which leaves lib/*.tsx unguarded —
// markdown.tsx, i18n.tsx and admin-auth.tsx all render JSX and none of
// them would have been read. They are clean today; the point is that
// nothing would have said so. A sweep that covers most of the tree is
// the same shape of gap as a guard family missing a member.
const SCANNED = [SRC];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    // Skip the test tree: this file's own source carries the banned
    // pattern as an executable regex, so scanning it would self-trip.
    if (entry === '__tests__') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

const files = SCANNED.flatMap((d) => walk(d));

/** Code with comments stripped — a doc comment that names the banned
 *  control while explaining the ban is not a violation. Same helper the
 *  date sweep uses. */
function code(file: string): string {
  return stripComments(readFileSync(file, 'utf8'));
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const rel = (f: string) => f.slice(SRC.length + 1).split(/[\\/]/).join('/');

describe('dropdowns use the shadcn Select, not the browser one', () => {
  it('the walk finds the pages at all', () => {
    // Without this the sweep below passes on an empty file list.
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => rel(f).includes('marketing'))).toBe(true);
  });

  it('no element anywhere renders a native <select>', () => {
    // `<select` with a following space or `>` — so `<Select` (the shadcn
    // component) and any `<selectSomething` identifier are not hits.
    const offenders = files.filter((f) => /<select[\s>]/.test(code(f))).map(rel);
    expect(
      offenders,
      'use <Select> from components/ui/select — a native <select> hands the whole control to the browser',
    ).toEqual([]);
  });

  it('the campaign dropdown actually renders the shadcn Select', () => {
    // Positive control, and the specific regression. A sweep for an
    // absence passes just as happily when the feature is deleted.
    const src = code(join(SRC, 'components', 'marketing', 'campaign-select.tsx'));
    expect(src, 'campaign-select: no shadcn Select').toMatch(/<Select\b/);
    expect(src, 'campaign-select: no trigger').toMatch(/<SelectTrigger\b/);
    expect(src, 'campaign-select: no items').toMatch(/<SelectItem\b/);
    expect(src, 'campaign-select: import went missing').toMatch(
      /from '@\/components\/ui\/select'/,
    );
  });

  it("the 'none' sentinel survives — Radix forbids an empty item value", () => {
    // The one behavioural difference between the native and shadcn
    // versions. If someone "simplifies" this back to value="", Radix
    // throws at render and every consuming page breaks at once.
    const src = code(join(SRC, 'components', 'marketing', 'campaign-select.tsx'));
    expect(src).toMatch(/value="none"/);
    expect(src).toMatch(/'none'/);
    expect(src, 'an empty SelectItem value is a Radix runtime error').not.toMatch(
      /<SelectItem\s+value=""/,
    );
  });

  it('the sweep reads CODE, not comments', () => {
    // Load-bearing control for code(). Tested against a LITERAL rather
    // than against a real file: this file's own source contains the
    // regex `/<select[\s>]/` as executable code, so a self-read would be
    // asserting on the wrong thing entirely.
    const sample = [
      '/* a doc comment naming <select> while banning it */',
      '// inline mention of <select>',
      'const a = 1;',
    ].join('\n');
    expect(stripComments(sample)).not.toMatch(/<select[\s>]/);
    expect(stripComments('const el = <select id="x">;')).toMatch(/<select[\s>]/);
  });
});
