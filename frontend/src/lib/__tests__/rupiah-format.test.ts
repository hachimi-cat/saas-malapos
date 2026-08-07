/*
 * Guard: no user-facing string may write rupiah in English comma format.
 *
 * The Forjio family renders currency two ways and the split runs INSIDE
 * single products. `<Price>` (@forjio/website-ui) formats through
 * `Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR'})` and yields
 * "Rp 46.000" with a dot. Hardcoded prose in page copy was written
 * "Rp 46,000" with a comma. A visitor moving between the pricing page and the
 * FAQ in one click saw both conventions for the same currency.
 *
 * This is NOT an ICU/locale bug and re-chasing one wastes a day: under an
 * `en-US` fallback `Intl` renders IDR as "IDR 7,613", not "Rp 7,613", so the
 * comma strings could never have come from a small-icu Node. They were
 * literals in JSX.
 *
 * Indonesian separators win because <Price> is the source of truth and
 * already uses them — and because comma-rupiah reads as a foreign product to
 * the audience these pages are for. Marketing screenshots inherit whatever is
 * on screen, so a regression here leaks into social content too.
 *
 * Scope is the rendered surface only — `src/app` and `src/components`.
 * Comments and test fixtures are exempt: a developer note reading
 * "Rp 42,000/hr" is for a human reading source, and nobody ships it.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Locate `src/` by walking up from this file rather than hardcoding a depth.
 * Products disagree on where tests live — most use `src/lib/__tests__`, but
 * plugipay's vitest config only includes `src/__tests__` — and this same file
 * is copied into every product, so a fixed `../..` silently resolves to the
 * wrong root in one of them and the guard passes by scanning nothing.
 */
function findSrc(from: string): string {
  let dir = from;
  while (path.basename(dir) !== 'src' && dir !== path.dirname(dir)) {
    dir = path.dirname(dir);
  }
  return path.basename(dir) === 'src' ? dir : path.resolve(from, '../..');
}

const SRC = findSrc(__dirname);
const SURFACES = [path.join(SRC, 'app'), path.join(SRC, 'components')];

/** Rp, optional separator, then a comma-grouped number — the en-US shape. */
const COMMA_RUPIAH = /Rp(?:&nbsp;|\s| )*\d{1,3}(?:,\d{3})+/g;

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // surface absent in this product — nothing to check
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      out = out.concat(walk(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Drop // line comments and block comments before matching. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('rupiah formatting', () => {
  it('uses Indonesian separators in every user-facing string', () => {
    const offenders: string[] = [];
    let scanned = 0;

    for (const surface of SURFACES) {
      for (const file of walk(surface)) {
        scanned++;
        const matches = stripComments(readFileSync(file, 'utf8')).match(COMMA_RUPIAH);
        if (matches) {
          offenders.push(`${path.relative(SRC, file)} → ${[...new Set(matches)].join(', ')}`);
        }
      }
    }

    // A guard that scans nothing reports green forever. If SRC resolved
    // wrongly — a moved test file, a restructured product — say so loudly
    // instead of quietly protecting nothing.
    expect(
      scanned,
      `scanned 0 files under ${SRC}; this guard is inert. Check that ` +
        'app/ and components/ are where they are expected.',
    ).toBeGreaterThan(0);

    expect(
      offenders,
      'Rupiah must use Indonesian separators (Rp 46.000, not Rp 46,000) to match ' +
        `the <Price> component. Offending files:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
