// Post-deploy verify: action picker (malapos) + providers panels (storlaunch).
// Run from /root/code/saas-malapos/e2e. GOJO_HUUDIS_PASSWORD required. Deleted after.
import { chromium } from 'playwright';

const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
const login = async (base, cookieName) => {
  const r = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'gojo@forjio.com', password: process.env.GOJO_HUUDIS_PASSWORD }),
  });
  if (!r.ok) fail(`${base} login ${r.status}`);
  const m = (r.headers.get('set-cookie') ?? '').match(new RegExp(`${cookieName}=([^;]+)`));
  if (!m) fail(`${base}: no ${cookieName} cookie`);
  return m[1];
};

const browser = await chromium.launch();

// ── 1. malapos: the action picker ─────────────────────────────────
{
  const BASE = 'https://staging-malapos.forjio.com';
  const ck = await login(BASE, 'malapos_session');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, timezoneId: 'Asia/Jakarta' });
  await ctx.addCookies([{ name: 'malapos_session', value: ck, domain: new URL(BASE).hostname, path: '/' }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${BASE}/dashboard/customers`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Ask assistant/ }).click();
  await page.waitForTimeout(500);
  if (!(await page.getByText('What would you like to do?').isVisible().catch(() => false)))
    fail('malapos: picker dialog did not open');
  if (!(await page.getByText('New customer').isVisible().catch(() => false)))
    fail('malapos: New customer option missing');
  if (!(await page.getByText('Bulk new customers').isVisible().catch(() => false)))
    fail('malapos: Bulk new option missing');
  // Nothing ticked -> the edit-shaped options render disabled with the hint.
  const editBtn = page.getByRole('button', { name: /Edit a customer/ });
  if (!(await editBtn.isDisabled().catch(() => false)))
    fail('malapos: Edit should be disabled with nothing ticked');
  await page.screenshot({ path: '/tmp/verify-picker-empty.png' });
  await page.keyboard.press('Escape');

  // Tick the first row, reopen — Edit the selected + Delete 1 light up.
  await page.locator('tbody tr input[type="checkbox"], tbody [role="checkbox"]').first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Ask assistant/ }).click();
  await page.waitForTimeout(500);
  const editSel = page.getByRole('button', { name: /Edit the selected customer/ });
  if (!(await editSel.isEnabled().catch(() => false)))
    fail('malapos: Edit the selected customer not enabled with 1 ticked');
  if (!(await page.getByRole('button', { name: /Delete 1 selected/ }).isEnabled().catch(() => false)))
    fail('malapos: Delete 1 selected not enabled');
  await page.screenshot({ path: '/tmp/verify-picker-selected.png' });
  if (errors.length) fail(`malapos pageerror: ${errors.join(' | ')}`);
  console.log('OK malapos picker: options + selection gating + screenshots');
  await ctx.close();
}

// ── 2. storlaunch: provider panels in the sheet ───────────────────
{
  const BASE = 'https://staging-storlaunch.forjio.com';
  const ck = await login(BASE, 'storlaunch_session');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1600 } });
  await ctx.addCookies([{ name: 'storlaunch_session', value: ck, domain: new URL(BASE).hostname, path: '/' }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${BASE}/dashboard/payments/settings/providers`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Ask assistant/ }).click();
  await page.waitForTimeout(1200);
  // Manual tab of the sheet: provider groups + boundary text + status lines.
  const dialog = page.locator('[role="dialog"]').filter({ hasText: 'payment providers' }).first();
  const manualToggle = page.getByRole('button', { name: /^Manual$/ }).first();
  if (await manualToggle.isVisible().catch(() => false)) await manualToggle.click();
  await page.waitForTimeout(400);
  for (const label of ['Xendit', 'PayPal', 'Midtrans']) {
    if (!(await page.getByText(label, { exact: true }).first().isVisible().catch(() => false)))
      fail(`storlaunch: ${label} group missing from providers sheet`);
  }
  if (!(await page.getByText(/never handles API keys/).first().isVisible().catch(() => false)))
    fail('storlaunch: secrets boundary explanation missing');
  if (!(await page.getByText(/Not connected|Connected/).first().isVisible().catch(() => false)))
    fail('storlaunch: no status line rendered');
  await page.screenshot({ path: '/tmp/verify-providers-sheet.png', fullPage: false });
  if (errors.length) fail(`storlaunch pageerror: ${errors.join(' | ')}`);
  console.log('OK storlaunch providers sheet: groups + boundary + status');
  await ctx.close();
}

await browser.close();
console.log('ALL OK');
