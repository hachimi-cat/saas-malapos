// Throwaway live check — bang's two fixes on malapos staging.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'https://staging-malapos.forjio.com';
const env = Object.fromEntries(
  fs.readFileSync('/root/.config/agents/gojo/credentials.env', 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);

let failures = 0;
const log = (...a) => console.log(...a);
const ok = (name, cond, extra = '') => {
  log(`${cond ? '  ok  ' : '  FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, timezoneId: 'Asia/Jakarta' });
log('login', (await ctx.request.post('/api/v1/auth/login', {
  data: { email: 'gojo@forjio.com', password: env.GOJO_HUUDIS_PASSWORD },
})).status());
const page = await ctx.newPage();

// Through the PAGE's own fetch, so the seed lands in the workspace the
// dashboard reads (see the plugipay probe — a pre-page request context
// can be scoped elsewhere entirely).
await page.goto('/dashboard', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const api = (path, init) =>
  page.evaluate(
    async ([p, i]) => {
      const r = await fetch(p, {
        ...i,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `gojo-${Math.random()}`, ...(i?.headers ?? {}) },
      });
      let body = null;
      try { body = await r.json(); } catch { /* empty */ }
      return { status: r.status, body };
    },
    [path, init ?? {}],
  );

const NAMES = ['Gojo Probe Alpha', 'Gojo Probe Beta', 'Gojo Probe Gamma'];
const listCats = async () => {
  const r = await api('/api/v1/categories?limit=200');
  const l = r.body?.data?.categories ?? r.body?.data ?? [];
  return Array.isArray(l) ? l : [];
};
for (const c of (await listCats()).filter((c) => String(c.name).startsWith('Gojo Probe'))) {
  await api(`/api/v1/categories/${c.id}`, { method: 'DELETE' });
}
const made = [];
for (const [i, name] of NAMES.entries()) {
  const res = await api('/api/v1/categories', {
    method: 'POST',
    body: JSON.stringify({ name, sortOrder: (i + 1) * 7 }),
  });
  if (res.status < 300) made.push(res.body?.data?.id ?? res.body?.id);
  else log('seed failed', name, res.status, JSON.stringify(res.body).slice(0, 200));
}
log('seeded', made.length);

await page.goto('/dashboard/categories', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// ── 1. ONE create button ────────────────────────────────────────────
const chevrons = await page.locator('button').evaluateAll((bs) =>
  bs.filter((b) => /More ways to add|Bulk new/i.test(b.getAttribute('aria-label') ?? '') ||
    /^Bulk new/i.test((b.innerText || '').trim())).length,
);
ok('no split-button chevron anywhere on the page', chevrons === 0, `found=${chevrons}`);
log('create-ish buttons:', JSON.stringify(await page.locator('button').evaluateAll((bs) =>
  bs.map((b) => (b.innerText || '').trim().replace(/\n/g, '|')).filter((t) => /new|add|categ/i.test(t)))));
await page.screenshot({ path: 'screenshots/_be-header.png' });

// ── 2. select the seeded rows ───────────────────────────────────────
for (const n of NAMES) {
  const row = page.locator('tr', { hasText: n }).first();
  const box = row.locator('[role="checkbox"], input[type="checkbox"]').first();
  if (await box.count()) { await box.click(); await page.waitForTimeout(250); }
  else log('  no checkbox for', n);
}
await page.waitForTimeout(500);
log('selection line:', (await page.locator('main').innerText()).split('\n').filter((l) => /selected|dipilih/i.test(l)).join(' / '));

const actions = page.getByRole('button', { name: 'Actions' });
await actions.first().click();
await page.locator('[role="menuitem"]').first().waitFor({ timeout: 10000 });
log('menuitems:', JSON.stringify(await page.locator('[role="menuitem"]').evaluateAll((xs) => xs.map((x) => (x.innerText || '').trim()))));
const bulkEdit = page.getByRole('menuitem', { name: /bulk edit|edit \d+/i });
ok('Bulk edit is offered', (await bulkEdit.count()) > 0);
if (await bulkEdit.count()) await bulkEdit.first().click();
await page.waitForTimeout(2000);

const dialog = page.getByRole('dialog').last();
const manual = dialog.getByRole('button', { name: /^Manual$/i });
ok('the sheet opened', (await manual.count()) > 0);
if (await manual.count()) await manual.first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: 'screenshots/_be-sheet-manual.png', fullPage: true });

const text = await dialog.innerText().catch(() => '');
const heading = text.split('\n').find((l) => /Editing/i.test(l)) ?? '';
ok('the sheet names WHO is being edited', /Editing \d+/i.test(text), heading.slice(0, 140));
ok('…in English — "3 categorys" is not a plural', /Editing 3 categories/i.test(heading), heading.slice(0, 60));

const values = await dialog.locator('input, textarea').evaluateAll((els) => els.map((e) => e.value).filter(Boolean));
log('values in the sheet:', JSON.stringify(values));
for (const n of NAMES) ok(`row for ${n} is prefilled`, values.includes(n));
for (const i of [0, 1, 2]) ok(`…and carries its own sortOrder ${(i + 1) * 7}`, values.includes(String((i + 1) * 7)));

// ── 3. untouched Save refuses ───────────────────────────────────────
const save = dialog.getByRole('button', { name: /^Save$/i }).last();
ok('Save is live on open', (await save.count()) > 0 && (await save.isEnabled()));
await save.click();
await page.waitForTimeout(1800);
ok('an untouched Apply refuses', /Nothing changed/i.test(await dialog.innerText().catch(() => '')));

// ── 4. edit ONE row ─────────────────────────────────────────────────
const betaBox = dialog.locator('input[value="Gojo Probe Beta"]').first();
ok('found the row to edit', (await betaBox.count()) > 0);
if (await betaBox.count()) {
  await betaBox.fill('Gojo Probe Beta EDITED');
  await page.waitForTimeout(300);
  await dialog.getByRole('button', { name: /^Save$/i }).last().click();
  await page.waitForTimeout(3500);
}
await page.screenshot({ path: 'screenshots/_be-after-save.png', fullPage: true });

const mine = (await listCats()).filter((c) => String(c.name).startsWith('Gojo Probe'));
log('categories now:', JSON.stringify(mine.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder }))));
ok('the edited row took its new name', mine.some((c) => c.name === 'Gojo Probe Beta EDITED'));
ok('the other two are untouched',
  mine.some((c) => c.name === 'Gojo Probe Alpha') && mine.some((c) => c.name === 'Gojo Probe Gamma'));
ok('and each kept its OWN sortOrder',
  mine.find((c) => c.name === 'Gojo Probe Beta EDITED')?.sortOrder === 14 &&
  mine.find((c) => c.name === 'Gojo Probe Alpha')?.sortOrder === 7);

for (const c of mine) log('deleted', c.name, (await api(`/api/v1/categories/${c.id}`, { method: 'DELETE' })).status);
const left = (await listCats()).filter((c) => String(c.name).startsWith('Gojo Probe'));
ok('every seeded row is gone', left.length === 0, `left=${left.length}`);

await browser.close();
console.log(failures === 0 ? '\nALL LIVE CHECKS PASSED' : `\n${failures} LIVE CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
