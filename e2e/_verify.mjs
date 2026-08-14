/**
 * Live check of agent-ui 0.22.0 on staging: a batch verb sheet must NOT
 * open on a "Draft ready" card quoting its own seeded target list, and
 * its hint must be a whole sentence rather than one built out of
 * `confirmLabel` (which carries the batch count).
 *
 * Product-agnostic — driven by BASE / LIST / BRAND / SHOT env vars.
 * Throwaway: delete after use.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE;
const LIST = process.env.LIST;
const BRAND = process.env.BRAND;
const SHOT = process.env.SHOT;

const env = Object.fromEntries(
  readFileSync('/root/.config/agents/gojo/credentials.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [
      l.slice(0, l.indexOf('=')).trim(),
      l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, ''),
    ]),
);

const results = [];
const ok = (label, cond, detail = '') =>
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ timezoneId: 'Asia/Jakarta' });
const page = await ctx.newPage();

const login = await ctx.request.post(`${BASE}/api/v1/auth/login`, {
  data: { email: 'gojo@forjio.com', password: env.GOJO_HUUDIS_PASSWORD },
  headers: { 'Idempotency-Key': `verify-${BRAND}-login` },
});
console.log('login', login.status());
if (!login.ok()) {
  console.log((await login.text()).slice(0, 300));
  process.exit(1);
}

await page.goto(`${BASE}${LIST}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Some list pages put the resource behind a tab (malapos Purchasing
// opens on Purchase Orders, not Suppliers).
if (process.env.TAB) {
  await page.locator(`button:has-text("${process.env.TAB}")`).first().click();
  await page.waitForTimeout(2500);
}

// Most list pages are DataTables; a few (storlaunch testimonials) are
// card lists with no <table> at all, so fall back to any checkbox in the
// content area. Switches ("Hidden") carry role="switch" and are excluded
// by asking for checkboxes specifically.
let boxes = page.locator('tbody tr [role="checkbox"], tbody tr input[type="checkbox"]');
if ((await boxes.count()) < 3) {
  boxes = page.locator('main [role="checkbox"], main input[type="checkbox"]');
}
const n = await boxes.count();
console.log('selectable rows:', n);
if (n < 3) {
  console.log('NOT ENOUGH ROWS');
  await page.screenshot({ path: SHOT.replace('.png', '-norows.png'), fullPage: true });
  await browser.close();
  process.exit(2);
}
for (let i = 0; i < 3; i += 1) await boxes.nth(i).click();
await page.waitForTimeout(500);

await page.locator('button:has-text("Actions"), button:has-text("Tindakan")').first().click();
await page.waitForTimeout(700);
const item = page
  .locator('[role="menuitem"]')
  .filter({ hasText: /(delete|hapus)/i })
  .filter({ hasText: /3/ })
  .first();
console.log('menu item:', await item.innerText().catch(() => '(none)'));
await item.click();
await page.waitForTimeout(2200);

const dialog = page.locator('[role="dialog"]').last();
const text = await dialog.innerText();
console.log('\n--- SHEET TEXT ---\n' + text + '\n------------------\n');

// Positive control FIRST: an unopened or wrong sheet would sail through
// every "does not contain" assertion below without measuring anything.
ok(
  'the batch sheet opened on 3 rows',
  /3\s+[^\n]*(selected|dipilih)/i.test(text),
  text.split('\n')[0],
);

// The defect.
ok('no DRAFT READY card on open', !/draft ready/i.test(text));
ok('the seeded target list is not quoted as a proposal', !text.includes('batchTargets'));

// The sentence.
ok('the hint is not built from the verb label', !/describe what to (delete|hapus)/i.test(text));
ok('the hint is a whole sentence', text.includes('Describe what you want.'));
const ph = await dialog.locator('form input[type="text"]').getAttribute('placeholder');
ok('the placeholder is whole too', ph === 'Describe what you want…', `got ${JSON.stringify(ph)}`);

// The seed is load-bearing: the primary button must still be live.
const primary = dialog.getByRole('button', { name: /^(Delete|Hapus)( \d+)?$/ }).last();
ok('the primary action is still enabled', !(await primary.isDisabled()));

await page.screenshot({ path: SHOT, fullPage: true });

// Prove it is live, not merely un-disabled: click through to the confirm
// and BACK OUT. This script deletes nothing.
await primary.click();
await page.waitForTimeout(1500);
const alert = page.locator('[role="alertdialog"]');
const confirmText = (await alert.count()) ? await alert.innerText() : '(no alertdialog)';
console.log('--- CONFIRM ---\n' + confirmText + '\n---------------');
ok(
  'the primary opens the destructive confirm',
  /(delete|hapus)\s+3/i.test(confirmText),
  confirmText.replace(/\n/g, ' | ').slice(0, 120),
);
await page.screenshot({ path: SHOT.replace('.png', '-confirm.png'), fullPage: true });

const cancel = alert.getByRole('button', { name: /cancel|batal/i }).first();
if (await cancel.count()) await cancel.click();
await page.waitForTimeout(500);

console.log(`\n=== ${BRAND} ===`);
for (const r of results) console.log(r);
console.log(results.some((r) => r.startsWith('FAIL')) ? '\nRESULT: FAILED' : '\nRESULT: all passed');

await browser.close();
