import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Checkboxes and switches are shadcn CONTROLS — never native inputs.
 *
 * Same rule as the date sweep, and the same reasoning: shadcn styling is
 * not a shadcn control. `<input type="checkbox" className="h-4 w-4
 * rounded border-border">` is a native control wearing a border, and it
 * carries the browser's own appearance, focus ring and check glyph into
 * a UI that has its own.
 *
 * bang, 2026-08-14, on being handed the count: *"fix it"*.
 *
 * The sweep also bans the DISGUISED form. A hand-rolled toggle — an
 * `sr-only` native checkbox driving two spans through `peer-checked:` —
 * is the same break with more code around it, and it is the one a
 * reviewer scrolls past. shadcn ships <Switch>.
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

/** Code with comments stripped — the replacement's own comment explains
 *  what it replaced, so a raw grep would fire on the documentation of
 *  the fix rather than on the fix being undone. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const rel = (f: string) => f.slice(SRC.length + 1).split(/[\\/]/).join('/');

describe('checkboxes are shadcn controls', () => {
  it('the walk finds the pages at all', () => {
    // Without this, every sweep below passes on an empty file list.
    expect(files.length).toBeGreaterThan(40);
  });

  it('no element anywhere sets type="checkbox"', () => {
    const offenders = files.filter((f) => /type=["']checkbox["']/.test(code(f))).map(rel);
    expect(
      offenders,
      'use <Checkbox> from components/ui/checkbox — a native input carries the browser\'s own control into the UI',
    ).toEqual([]);
  });

  it('no hand-rolled switch built from an sr-only checkbox', () => {
    // The disguised form. Catch the MECHANISM (peer-checked driving a
    // sibling), not the words, because the giveaway class list varies.
    const offenders = files
      .filter((f) => /peer-checked:/.test(code(f)))
      .map(rel);
    expect(
      offenders,
      'use <Switch> from components/ui/switch — `peer-checked:` means a native input is driving the visuals',
    ).toEqual([]);
  });

  it('the shadcn control actually exists to import', () => {
    // Positive control: a sweep for an ABSENCE passes just as happily
    // when the replacement was never there.
    const cb = readFileSync(join(SRC, 'components', 'ui', 'checkbox.tsx'), 'utf8');
    expect(cb).toMatch(/@radix-ui\/react-checkbox/);
    const sw = readFileSync(join(SRC, 'components', 'ui', 'switch.tsx'), 'utf8');
    expect(sw).toMatch(/@radix-ui\/react-switch/);
  });

});
