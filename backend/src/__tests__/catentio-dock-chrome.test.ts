import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 5 (Chrome) of the embedded-agent pass, held as tests — the
 * malapos port of ripllo's catentio-dock-chrome.test.ts (e919d93).
 * docked-chat.tsx was copied from linksnap verbatim, and none of what
 * that carried over type-checks:
 *
 * - `avatarUrl="/apple-touch-icon.png"` pointed at a file malapos never
 *   shipped — malapos had NO frontend/public/ at all (linksnap, the
 *   source of the copy, ships the PNG, so it was right there by
 *   accident). Every assistant reply rendered the browser's
 *   broken-image glyph; prod answered 404 for the path on 2026-08-19.
 *   Next serves public/ verbatim and nothing else checks the string.
 * - The dock's insets are meant to mirror <main>'s padding so the pill
 *   lines up with the page content. linksnap's shell steps at `sm:`;
 *   malapos's dashboard-shell steps at `md:` — the copied `sm:inset-x-6`
 *   sat 8px inside the content between 640 and 767px. Same reason
 *   `pb-52` needs the variant at the SAME breakpoint: `md:p-6` sets
 *   padding-bottom too and emits after a bare `pb-52`, so without
 *   `md:pb-52` the reservation silently disappears at ≥768px.
 * - No `suggestions` → no starter chips at all. bang asked for a greeting
 *   and three ways in (2026-08-08); the package renders chips only when
 *   the product passes them.
 *
 * (ripllo's fourth case — the brand circle getting a tile instead of a
 * currentColor glyph — does not apply here: malapos's LogoMark is
 * already the bare receipt glyph on lucide's 24-box.)
 */

const FRONTEND = resolve(__dirname, '../../../frontend');
const PUBLIC = resolve(FRONTEND, 'public');
const APP = resolve(FRONTEND, 'src/app');
const DOCKED = resolve(FRONTEND, 'src/components/catentio/docked-chat.tsx');
const SHELL = resolve(FRONTEND, 'src/components/dashboard-shell.tsx');
const LAYOUT = resolve(APP, 'layout.tsx');

const read = (p: string) => readFileSync(p, 'utf8');
/** A "/foo.png" public URL → does frontend/public/foo.png exist? */
const servedFromPublic = (url: string) => /^\/[^/]/.test(url) && existsSync(resolve(PUBLIC, `.${url}`));

describe('the docked assistant chrome (Phase 5)', () => {
  it('CONTROL — the frontend tree is where this test thinks it is', () => {
    for (const f of [DOCKED, SHELL, LAYOUT]) expect(existsSync(f), f).toBe(true);
    // and the public resolver is real: a never-shipped file is NOT found
    expect(servedFromPublic('/zzz-never-shipped.png')).toBe(false);
    // the tab favicon is Next's file convention, not a public/ file
    expect(existsSync(resolve(APP, 'icon.svg'))).toBe(true);
  });

  it('the assistant avatar is a file public/ actually serves', () => {
    const src = read(DOCKED);
    const m = src.match(/avatarUrl="([^"]+)"/);
    expect(m, 'avatarUrl is set on <DockedChat>').not.toBeNull();
    expect(servedFromPublic(m![1]!), `${m![1]} must exist under frontend/public`).toBe(true);
  });

  it('every icon the root layout declares resolves, and the tab favicon is re-declared (metadata.icons DROPS the file convention)', () => {
    const src = read(LAYOUT);
    const block = src.match(/icons:\s*\{[\s\S]*?\n\s*\},/);
    expect(block, 'metadata.icons is declared').not.toBeNull();
    const apple = block![0].match(/apple:\s*'([^']+)'/);
    expect(apple, 'metadata.icons.apple is declared').not.toBeNull();
    expect(servedFromPublic(apple![1]!), `${apple![1]} must exist under frontend/public`).toBe(true);
    // On this Next (15.5.19), declaring metadata.icons at all drops the
    // app/icon.svg file-convention link (resolve-metadata.js merges
    // leafSegmentStaticIcons only when the source declares NO icons — a
    // build with only `apple:` emitted no rel="icon" tag). So the block
    // must re-declare the favicon, and every url must resolve: from
    // public/, or from the file convention's own route (/icon.svg ←
    // src/app/icon.svg), the huudis/plugipay shape.
    const urls = [...block![0].matchAll(/url:\s*'([^']+)'/g)].map((x) => x[1]!);
    expect(urls.length, 'the tab favicon is re-declared as an icon url').toBeGreaterThanOrEqual(1);
    for (const u of urls) {
      const conventionFile = /^\/((?:apple-)?icon\.(?:svg|png|ico)|favicon\.ico)$/.test(u) && existsSync(resolve(APP, `.${u}`));
      expect(servedFromPublic(u) || conventionFile, `${u} must exist under frontend/public or as an app/ file convention`).toBe(true);
    }
  });

  it("the dock's insets step at the same breakpoint as <main>'s padding, and the reserve carries that variant", () => {
    const shell = read(SHELL);
    const main = shell.match(/<main\s+className=\{`([^`]*)`/);
    expect(main, '<main className={`…`}> found').not.toBeNull();
    const padStep = main![1]!.match(/\b(sm|md|lg):p-6\b/);
    expect(padStep, 'main pads p-4 then <bp>:p-6').not.toBeNull();
    const bp = padStep![1]!;
    // the reserve must be re-asserted at that same breakpoint
    expect(main![1], `pb-52 must be re-asserted as ${bp}:pb-52 (\`${bp}:p-6\` overrides a bare pb-52)`).toMatch(new RegExp(`\\bpb-52 ${bp}:pb-52\\b`));

    const dock = read(DOCKED);
    // resting: 'absolute inset-x-4 bottom-4 … <bp>:inset-x-6 <bp>:bottom-6'
    const resting = dock.match(/'absolute inset-x-4 bottom-4 [^']*'/);
    expect(resting, 'resting dock class string found').not.toBeNull();
    expect(resting![0]).toContain(`${bp}:inset-x-6`);
    expect(resting![0]).toContain(`${bp}:bottom-6`);
    // expanded: 'fixed inset-0 … <bp>:absolute <bp>:inset-x-6 <bp>:bottom-6 <bp>:top-6'
    const expanded = dock.match(/'fixed inset-0 [^']*'/);
    expect(expanded, 'expanded dock class string found').not.toBeNull();
    for (const t of ['absolute', 'inset-x-6', 'bottom-6', 'top-6']) expect(expanded![0]).toContain(`${bp}:${t}`);
    // and no OTHER breakpoint prefix sneaks into either string
    const others = ['sm', 'md', 'lg'].filter((x) => x !== bp);
    for (const o of others) {
      expect(resting![0]).not.toMatch(new RegExp(`\\b${o}:`));
      expect(expanded![0]).not.toMatch(new RegExp(`\\b${o}:`));
    }
  });

  it('a new session offers three starter chips', () => {
    const dock = read(DOCKED);
    const m = dock.match(/suggestions=\{\[([\s\S]*?)\]\}/);
    expect(m, 'suggestions={[…]} passed to <DockedChat>').not.toBeNull();
    const chips = [...m![1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!.trim()).filter(Boolean);
    expect(chips).toHaveLength(3);
    for (const c of chips) expect(c.length).toBeGreaterThan(12);
  });
});
