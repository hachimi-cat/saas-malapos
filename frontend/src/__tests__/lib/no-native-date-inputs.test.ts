import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No `<input type="date">` anywhere — the shadcn CONTROL rule, applied
 * to dates.
 *
 * This shipped wrong once in a way worth recording. The first fix swapped
 * the bare `<input>` for shadcn's `<Input type="date">`, which LOOKS like
 * compliance — it is the shadcn component, imported from
 * components/ui/input — and is not: `type="date"` hands the entire
 * control to the browser, so the merchant still gets the OS date widget,
 * just inside a shadcn border. bang, 2026-08-14, on being shown it:
 * *"the completed input field in 'new portfolio' still use primitive
 * datepicker, not shadcn"*.
 *
 * So the sweep bans the ATTRIBUTE, on any element, shadcn or not. That
 * is the only form of it that catches the mistake actually made — a
 * check for "is it a bare <input>" would have passed the broken build.
 *
 * The replacement is components/ui/date-picker.tsx (Popover + Calendar,
 * react-day-picker), which keeps the same `yyyy-MM-dd` string value, so
 * every existing form's state and every dateOnly()/isoInstant() call in
 * resources.ts are untouched.
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

/** Code with comments stripped — the date-picker component's own doc
 *  comment says what it replaces, and so does this rule's explanation in
 *  agentic-sheet.tsx. A raw grep would fire on the very sentences that
 *  document the fix. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const rel = (f: string) => f.slice(SRC.length + 1).split(/[\\/]/).join('/');

describe('dates use the shadcn picker, not the browser one', () => {
  it('the walk finds the pages at all', () => {
    // Without this the sweep below passes on an empty file list.
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => rel(f).includes('purchasing'))).toBe(true);
  });

  it('no element anywhere sets type="date"', () => {
    const offenders = files.filter((f) => /type=["']date["']/.test(code(f))).map(rel);
    expect(
      offenders,
      'use <DatePicker> from components/ui/date-picker — `<Input type="date">` is the BROWSER control wearing a shadcn border',
    ).toEqual([]);
  });

  it('the date fields actually render the picker', () => {
    // Positive control, and the specific regression. A sweep for an
    // absence passes just as happily when the feature is deleted, so
    // name the three surfaces that must carry it.
    const mustHave: [string, string][] = [
      // Every customKind('date') in every sheet renders through this one.
      ['components/catentio/agentic-sheet.tsx', 'DateField'],
      ['app/(dashboard)/dashboard/purchasing/page.tsx', 'expiryDate'],
      ['app/(dashboard)/dashboard/fulfillment/licenses/page.tsx', 'expiresAt'],
    ];
    for (const [file, marker] of mustHave) {
      const src = code(join(SRC, ...file.split('/')));
      expect(src, `${file}: no DatePicker`).toMatch(/<DatePicker\b/);
      expect(src, `${file}: ${marker} went missing — wrong file?`).toContain(marker);
    }
  });

  it('the picker is a real popover calendar, not a restyled native input', () => {
    // The component the whole sweep redirects to. If this ever becomes
    // an <input type="date"> again, every other assertion here still
    // passes while the product regresses to exactly what bang rejected.
    const picker = code(join(SRC, 'components', 'ui', 'date-picker.tsx'));
    expect(picker).toMatch(/<Popover\b/);
    expect(picker).toMatch(/<Calendar\b/);
    expect(picker).not.toMatch(/type=["']date["']/);
  });

  it('the sweep reads CODE — the comment explaining the ban is not a hit', () => {
    // Load-bearing control for code(). agentic-sheet.tsx's comment
    // quotes `type="date"` because that is what it is explaining.
    const doc = join(SRC, 'components', 'catentio', 'agentic-sheet.tsx');
    expect(readFileSync(doc, 'utf8')).toMatch(/type="date"/);
    expect(code(doc)).not.toMatch(/type=["']date["']/);
  });
});

/**
 * A popover inside the agentic sheet has to survive the sheet's own
 * modal lock.
 *
 * Radix's modal Dialog sets `pointer-events: none` on <body> while it is
 * open and re-enables it only inside the dialog's own subtree. Our
 * Popover portals to <body>, so it lands OUTSIDE that subtree and
 * inherits the lock. The calendar then renders perfectly — visible, in
 * the viewport, opacity 1 — and is completely inert. Measured on real
 * WebKit at iPad Pro 11: `pointer-events: none` on the popper content
 * AND on every day cell, `elementFromPoint` over the calendar returning
 * a SHEET element, and tapping a day timing out.
 *
 * That is what bang hit — 2026-08-14: *"portfolio completed date field
 * in the sheet cannot be clicked in ipad safari"*. It was never
 * iPad-specific: desktop Chromium failed identically. Every
 * `customKind('date')` in every sheet was dead.
 *
 * `pointer-events-auto` on the CONTENT is the whole fix: the property
 * inherits, but an explicit `auto` on a descendant re-enables hit
 * testing regardless of an ancestor's `none`.
 */
describe('a popover survives the sheet\'s modal pointer-events lock', () => {
  const popover = readFileSync(join(SRC, 'components', 'ui', 'popover.tsx'), 'utf8');

  it('PopoverContent re-enables pointer events', () => {
    expect(popover).toMatch(/pointer-events-auto/);
  });

  it('it is on the CONTENT, which is what the lock reaches', () => {
    // Not on the Portal and not on the Root: the inherited `none` comes
    // down through the popper wrapper, so the re-enable has to sit on an
    // element inside it. Assert it travels with the content's class list.
    const contentClasses = popover.slice(popover.indexOf('PopoverPrimitive.Content'));
    expect(contentClasses).toMatch(/pointer-events-auto/);
  });
});

/**
 * The sheet's date trigger is a BUTTON, so it does not inherit the
 * manual editor's input styling the way the text fields do — it has to
 * be told. Left alone it kept `date-picker.tsx`'s page-sized default
 * (`h-9`, 36px) and stood 6px taller than the field beside it. bang,
 * 2026-08-14: *"its height should be the same as client input field"*.
 *
 * Measured in the live sheet on an iPad: the manual editor renders every
 * text input as `h-auto px-2 py-1 text-[11.5px]` on top of Input's own
 * `md:text-sm`, which lands at 30px. The trigger needs the SAME set,
 * `md:text-sm` included — without it the font drops to 11.5px at iPad
 * width and the button shrinks to 27px, missing from the other side.
 */
describe('the sheet\'s date trigger matches the sheet\'s other fields', () => {
  const sheet = readFileSync(join(SRC, 'components', 'catentio', 'agentic-sheet.tsx'), 'utf8');
  const datePicker = sheet.slice(sheet.indexOf('<DatePicker'), sheet.indexOf('<DatePicker') + 800);

  it('carries the manual editor\'s compact field metrics', () => {
    for (const cls of ['h-auto', 'px-2', 'py-1', 'text-[11.5px]']) {
      expect(datePicker, `date trigger missing ${cls}`).toContain(cls);
    }
  });

  it('keeps md:text-sm, or it undershoots instead of overshooting', () => {
    // The half that is easy to drop. Input carries `md:text-sm`; at iPad
    // width that is what decides the font size and therefore the height.
    expect(datePicker).toContain('md:text-sm');
  });

  it('does NOT pin a fixed height — h-9 is the page-level size', () => {
    expect(datePicker).not.toMatch(/className="[^"]*\bh-9\b/);
  });
});
