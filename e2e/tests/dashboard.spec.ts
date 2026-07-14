import { expect, test, type Page } from '@playwright/test';
import {
  loginAsGojo,
  authenticateAndNavigate,
  seedSale,
  type SeededSale,
  type TestAuth,
} from './fixtures/auth-helpers';

/**
 * The authenticated smoke gate.
 *
 * Until this existed, the only thing standing between a push and production
 * was a health-endpoint check and a marketing-page render — both PUBLIC. The
 * entire logged-in product could have been broken and the pipeline would have
 * shipped it, green.
 *
 * It signs in as gojo — a real prod-Huudis identity — carries the real session
 * into the browser, and drives the dashboard. If auth breaks, this breaks.
 * (It used to self-register a throwaway user, which silently wrote a REAL row
 * into the PRODUCTION identity DB on every push. See fixtures/auth-helpers.ts.)
 *
 * WHY EVERY ASSERTION HERE IS STATE-INDEPENDENT
 * ---------------------------------------------
 * gojo's account is PERSISTENT and SHARED across runs — it carries whatever
 * earlier runs left behind. So no assertion may depend on the account being
 * empty. The previous version of this file asserted the outlet onboarding card
 * ("Finish setup to start selling") was VISIBLE. That card is gated on
 * `hasOutlet === false`, i.e. on the account having NO outlets — true of a
 * virgin user, false forever after the gate's own seed runs once. It was
 * guaranteed to rot, so it is gone.
 *
 * The durable pattern instead: `beforeAll` rings up a real sale for THIS RUN
 * through the real authenticated API, and the tests assert the browser renders
 * THAT sale — by its server-minted receipt number (a fresh value every run) and
 * by the run-unique rupiah amount it was rung up for. Both were produced at
 * runtime, live only in the staging DB, and appear nowhere in the client bundle,
 * so they can only reach the screen if the browser's own authenticated fetch
 * succeeded. That holds no matter how dirty the account is.
 *
 * (The outlet and product the sale needs are ENSURED, not created per run: the
 * Free tier caps gojo at ONE outlet, so a create-every-run fixture would 403 on
 * its second run. See fixtures/auth-helpers.ts.)
 *
 * WHY IT ASSERTS ON DATA, NOT JUST THE SHELL
 * ------------------------------------------
 * The dashboard's effect is a `Promise.allSettled` over four authenticated
 * GETs, and every stat falls back to a zero:
 *
 *     if (r.status === 'fulfilled') setRecent(...)
 *     setLoading(false);                       // runs no matter what
 *
 * `setLoading(false)` fires unconditionally, so a COMPLETELY DEAD backend still
 * paints the "Dashboard" heading, the nav, a row of zeros — and "No sales yet."
 * Asserting "the heading is visible" would pass against a broken product. Even
 * "the '—' placeholders cleared" would: they clear on failure too. That makes
 * the dashes a useful SYNC POINT and nothing more; they are used as one below
 * and are never the proof.
 *
 * The proof is the inverse: "No sales yet." is EXACTLY what a dead backend
 * paints (`recent` stays `[]` when GET /sales rejects — 401, 5xx and an HTML
 * error page all end in `ApiRequestError`). We seeded a sale, so a live read
 * MUST have rows and that empty state MUST be gone — and the seeded receipt
 * number and its run-unique rupiah total must be on screen in its place.
 */

// The dashboard layout injects Suppuo's third-party widget.js from another
// origin; its noise is not this product's health. Everything else counts.
const IGNORED_CONSOLE = [
  /favicon/i,
  /Download the React DevTools/i,
  /suppuo\.com/i,
  /widget\.js/i,
];

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (e) => {
    const text = String(e);
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    errors.push(text);
  });
  return errors;
}

/** The stats render '—' while `loading` is true and their real value after the
 *  effect's await resolves. Waiting for the dashes to clear is the sync point
 *  that says "all four promises settled" — it is NOT evidence any of them
 *  RESOLVED (see the header). It just stops us asserting mid-flight. */
async function waitForDashboardSettled(page: Page): Promise<void> {
  await expect(page.getByText('—', { exact: true })).toHaveCount(0, { timeout: 30_000 });
}

/** Match a rupiah figure by its digits, tolerating id-ID grouping ("Rp 42.318")
 *  without hard-coding which separator the runtime's Intl data picks. */
function rupiahPattern(amount: number): RegExp {
  const digits = String(amount).split('').join('[.,\\s]?');
  return new RegExp(`Rp\\s*${digits}`);
}

/** The empty state a dead backend paints. Its ABSENCE is load-bearing. */
const NO_SALES = 'No sales yet.';

test.describe.configure({ mode: 'serial' });

let auth: TestAuth;
let seeded: SeededSale;

test.beforeAll(async () => {
  auth = await loginAsGojo();
  // This run's own state. Every string below is minted here, at runtime.
  seeded = await seedSale(auth);
});

test('the authenticated dashboard renders, and its data path is live', async ({ page }) => {
  const errors = watchConsole(page);

  await authenticateAndNavigate(page, auth, '/dashboard');

  // A bounce to /login is the failure this gate exists to catch: the dashboard
  // layout is a server-side gate that redirects when the session won't resolve.
  expect(page.url(), 'bounced to login — the session was rejected').not.toContain('/login');

  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({
    timeout: 30_000,
  });

  // Sync point only — the dashes clear even when every fetch rejected.
  await waitForDashboardSettled(page);

  // LOAD-BEARING #1. `recent` stays `[]` on a rejected GET /sales, and an empty
  // `recent` renders this exact sentence. We seeded a sale through the real API
  // this run, so a browser that actually reached the backend CANNOT still be
  // showing the empty state.
  await expect(
    page.getByText(NO_SALES),
    'the dashboard still shows "No sales yet." for an account that HAS sales — the authenticated GET /sales failed in the browser',
  ).toHaveCount(0);

  // LOAD-BEARING #2 + #3. The receipt number the SERVER minted for this run's
  // sale, and the run-unique rupiah amount we rang it up for. Neither string is
  // in the client bundle; only a live authenticated read can put them on screen.
  await expect(
    page.getByText(seeded.receiptNumber).first(),
    'the receipt number of the sale we created via the API never rendered — the recent-sales read path is broken',
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(rupiahPattern(seeded.total)).first(),
    'the run-unique sale total never rendered — the dashboard is not reading the API',
  ).toBeVisible({ timeout: 30_000 });

  expect(errors, `console errors on /dashboard:\n${errors.join('\n')}`).toEqual([]);
});

test('server-created data reaches the browser on the sales page', async ({ page }) => {
  const errors = watchConsole(page);

  // A second, independent read path: the sales page filters + lists straight
  // from GET /sales. The same two runtime-minted strings must be here too —
  // they live only in the staging DB, so a degraded shell cannot invent them,
  // and no previous run can have left them behind.
  await authenticateAndNavigate(page, auth, '/dashboard/sales');
  expect(page.url(), 'bounced to login — the session was rejected').not.toContain('/login');

  await expect(
    page.getByText(seeded.receiptNumber).first(),
    'the sale we rang up via the API never rendered — the authenticated read path is broken',
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(rupiahPattern(seeded.total)).first(),
    'the run-unique sale total never rendered on the sales page',
  ).toBeVisible({ timeout: 30_000 });

  // Same argument as the dashboard's "No sales yet.": this is the sentence an
  // account with no readable sales shows, and it is what a rejected fetch leaves
  // behind. We have a sale, so it must be gone.
  await expect(
    page.getByText('No sales match these filters yet.'),
    'the sales page still shows its empty state for an account that HAS sales',
  ).toHaveCount(0);

  expect(errors, `console errors on the sales page:\n${errors.join('\n')}`).toEqual([]);
});
