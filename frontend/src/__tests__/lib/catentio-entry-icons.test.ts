import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The icon follows the ACTION, not the mechanism (bang, 2026-08-09 —
 * ported from storlaunch's catentio-entry-icons guard, grown wave-1
 * verb arms).
 *
 *   create      +             makes one new record
 *   edit        pencil        changes the record the user picked
 *   delete      trash         removes it (destructive chrome)
 *   publish     globe         puts a post on the storefront
 *   unpublish   undo          takes it back to draft
 *   mark-paid   check-circle  settles a payout
 *
 * What the button DOES is what the merchant reads off the icon; "it
 * happens to open the assistant" is an implementation detail and the
 * same for every one of them, so it distinguishes nothing. The verb
 * icons match what the hand-built pages already used (blog rows wear
 * Globe/Undo2/Trash2; the payouts status column wears CheckCircle2).
 *
 * Malapos wrinkle: money/stock EVENTS are modelled as pseudo-resources
 * whose only mode is 'create' (refunds, sale-voids, po-receipts,
 * inventory-adjustments…). Their entries are verbs — "Refund",
 * "Receive", "Adjust" — so they wear their OWN icon, not Plus; the
 * every-entry-has-an-icon rule still applies to them.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const files = walk(join(process.cwd(), 'src'));

interface Entry {
  file: string;
  resource: string | null;
  mode: string | null;
  trigger: string;
}

/** Pseudo-resources whose 'create' IS a verb (an event, not a record
 *  form) — they carry their own verb icon instead of Plus. */
const VERB_CREATE_RESOURCES = new Set([
  'refunds',
  'sale-voids',
  'po-receipts',
  'gift-cards',
  'inventory-adjustments',
  'inventory-transfers',
  'stock-batches',
]);

/** The trigger is the children of <AgenticEntry> — what sits between the
 *  closing `>` of the OPENING tag and `</AgenticEntry>`.
 *
 *  `fallback={<button>…</button>}` lives inside the opening tag and has
 *  its own icon, so it must not be scanned. A forward regex matches the
 *  fallback's own `>` first and swallows it, so anchor on the LAST
 *  opening-tag terminator (the storlaunch lesson). */
function entries(file: string, src: string): Entry[] {
  return src
    .split('</AgenticEntry>')
    .slice(0, -1)
    .map((chunk) => {
      const re = /\n[ \t]*>\n/g;
      let last: RegExpExecArray | null = null;
      let m: RegExpExecArray | null;
      while ((m = re.exec(chunk))) last = m;
      if (!last) return null;
      const open = chunk.slice(0, last.index);
      const start = open.lastIndexOf('<AgenticEntry');
      const tag = open.slice(start);
      return {
        file: file.split('/src/')[1],
        resource: /resource=(?:"([a-z-]+)"|\{['"]([a-z-]+)['"]\})/.exec(tag)?.[1] ?? null,
        mode: /mode=(?:"([a-z-]+)"|\{['"]([a-z-]+)['"]\})/.exec(tag)?.[1] ?? null,
        trigger: chunk.slice(last.index + last[0].length),
      };
    })
    .filter((e): e is Entry => e !== null && e.trigger.trim().length > 0);
}

const all = files.flatMap((f) => entries(f, readFileSync(f, 'utf8')));

describe('assistant entry icons', () => {
  it('finds the entries at all — the matcher must not silently match nothing', () => {
    expect(all.length).toBeGreaterThanOrEqual(10);
  });

  it('finds the wave-1 verb entries — publish/unpublish/delete/mark-paid are wired', () => {
    const modes = new Set(all.map((e) => e.mode));
    for (const verb of ['delete', 'publish', 'unpublish', 'mark-paid']) {
      expect(modes.has(verb), `no AgenticEntry with mode="${verb}" found`).toBe(true);
    }
  });

  it('every entry has an icon — "just make sure they have icon"', () => {
    const bare = all
      .filter((e) => !/<[A-Z][A-Za-z0-9]*\b/.test(e.trigger))
      .map((e) => `${e.file}: ${e.trigger.trim().slice(0, 50)}`);
    expect(bare, 'these render a bare word with no icon').toEqual([]);
  });

  /** `mode` decides the icon (a pseudo-resource's create is a verb
   *  with its own icon — see VERB_CREATE_RESOURCES). */
  function expected(e: Entry): string | null {
    switch (e.mode) {
      case 'create':
        return e.resource && VERB_CREATE_RESOURCES.has(e.resource) ? null : 'Plus';
      case 'edit':
        return 'Pencil';
      case 'delete':
        return 'Trash2';
      case 'publish':
        return 'Globe';
      case 'unpublish':
        return 'Undo2';
      case 'mark-paid':
        return 'CheckCircle2';
      default:
        return null;
    }
  }

  it('no trigger names the assistant — the label is the verb', () => {
    const offenders = all
      .filter((e) => /assistant/i.test(e.trigger))
      .map((e) => `${e.file}: ${e.trigger.trim().slice(0, 50)}`);
    expect(offenders).toEqual([]);
  });

  it('the icon agrees with what the button says it does', () => {
    const offenders = all
      .map((e) => ({ e, want: expected(e) }))
      .filter(({ e, want }) => want !== null && !new RegExp(`<${want}\\b`).test(e.trigger))
      .map(({ e, want }) => `${e.file}: want ${want} — ${e.trigger.trim().slice(0, 46)}`);
    expect(offenders).toEqual([]);
  });

  it('classifies most entries — a rule that opted out of everything would pass vacuously', () => {
    expect(all.filter((e) => expected(e) !== null).length).toBeGreaterThanOrEqual(10);
  });
});
