import type { Page } from '@playwright/test';

/**
 * Log in as gojo — the designated Forjio E2E identity — against staging and
 * hand the session to the browser.
 *
 * WHY NOT SELF-REGISTRATION (the thing this replaces)
 * ---------------------------------------------------
 * This gate used to POST /api/v1/auth/signup and mint a throwaway user per
 * run. That looked hermetic and was not: malapos — including STAGING — verifies
 * identity against PRODUCTION Huudis (`iss: https://huudis.com`). Every CI run
 * of a self-registering gate wrote a REAL USER into the production identity
 * database. At push frequency that is unacceptable, so the gate now signs in as
 * an account that already exists there.
 *
 * `gojo@forjio.com` is a real, verified prod-Huudis identity kept for exactly
 * this. Its malapos account is `acc_4593c748ccb0164d7ce64baa`.
 *
 * THE CONSEQUENCE THAT SHAPES EVERY ASSERTION
 * -------------------------------------------
 * gojo's account is PERSISTENT and SHARED ACROSS RUNS. It accumulates whatever
 * previous runs left behind, so a fresh-user assumption is now WRONG: anything
 * asserted about an EMPTY account passes once and rots forever after. Assertions
 * must be state-INDEPENDENT — see the header of dashboard.spec.ts.
 *
 * The password comes from GOJO_HUUDIS_PASSWORD and there is NO fallback: if it
 * is missing we THROW. We do not test.skip(). A gate that quietly skips when a
 * secret is absent is precisely the inert gate this work exists to remove — it
 * would report green while proving nothing.
 *
 * Login is cookie-only: the body is just {data:{signedIn,role}} — no token, no
 * user. The session IS the `malapos_session` cookie in Set-Cookie. The identity
 * endpoint is GET /api/v1/auth/me (not /api/v1/me) and the accountId is at
 * `data.user.id` (suppuo returns `data.accountId`). Verified against staging.
 */

const FRONTEND_URL =
  process.env.FRONTEND_URL || 'https://staging-malapos.forjio.com';
const API_BASE =
  process.env.BACKEND_URL || `${FRONTEND_URL.replace(/\/+$/, '')}/api/v1`;

const SESSION_COOKIE = 'malapos_session';

const GOJO_EMAIL = process.env.GOJO_HUUDIS_EMAIL || 'gojo@forjio.com';

function gojoPassword(): string {
  const pw = process.env.GOJO_HUUDIS_PASSWORD;
  if (!pw) {
    throw new Error(
      'GOJO_HUUDIS_PASSWORD is not set. The authenticated gate signs in as ' +
        `${GOJO_EMAIL} against prod Huudis and cannot run without it. This is a ` +
        'hard failure on purpose: skipping would let the pipeline report green ' +
        'while proving nothing about the logged-in product.',
    );
  }
  return pw;
}

function frontendHostname(): string {
  try {
    return new URL(FRONTEND_URL).hostname;
  } catch {
    return 'staging-malapos.forjio.com';
  }
}

/** Staging serves https, where the session cookie carries Secure — a planted
 *  cookie whose `secure` flag disagrees with the scheme is dropped silently. */
function frontendIsHttps(): boolean {
  try {
    return new URL(FRONTEND_URL).protocol === 'https:';
  } catch {
    return true;
  }
}

export interface TestAuth {
  user: { accountId: string; email: string };
  sessionCookie: string;
}

/** Poll the authenticated /auth/me until the session is queryable. Login can
 *  answer before the session is live; racing that bounces the dashboard to
 *  /login mid-test and reads as a product bug when it is a test bug. */
async function waitForSessionLive(
  sessionCookie: string,
): Promise<{ accountId: string } | null> {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { cookie: `${SESSION_COOKIE}=${sessionCookie}` },
      });
      if (res.ok) {
        const json = await res.json();
        const accountId = json?.data?.user?.id;
        if (accountId) return { accountId };
      }
    } catch {
      // network blip on a just-deployed staging — retry until the deadline
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

/** Sign in as gojo via the real staging login API. */
export async function loginAsGojo(retries = 5): Promise<TestAuth> {
  const password = gojoPassword();

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: GOJO_EMAIL, password }),
    });
    const json = await res.json().catch(() => ({}));

    if (res.ok) {
      const setCookie = res.headers.get('set-cookie') ?? '';
      const m = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(setCookie);
      if (!m) {
        throw new Error(
          `login succeeded but no ${SESSION_COOKIE} in Set-Cookie: ${setCookie}`,
        );
      }
      const sessionCookie = m[1];
      const live = await waitForSessionLive(sessionCookie);
      if (!live) {
        throw new Error(
          'login succeeded but GET /auth/me never returned a user — the session never went live',
        );
      }
      return {
        user: { accountId: live.accountId, email: GOJO_EMAIL },
        sessionCookie,
      };
    }

    // Rate limiting is the one retryable failure. Bad credentials are NOT:
    // a 401 means the gate cannot authenticate and must fail loudly.
    if (
      (res.status === 429 || (json as { error?: { code?: string } })?.error?.code === 'RATE_LIMITED') &&
      attempt < retries
    ) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(
      `login as ${GOJO_EMAIL} failed (${res.status}): ${JSON.stringify(json)}`,
    );
  }
  throw new Error('login failed: retries exhausted');
}

/** Call the product API as gojo. Used to seed real rows so the browser has
 *  something only a live backend could ever hand it. */
export async function apiAs<T = unknown>(
  auth: TestAuth,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {
    cookie: `${SESSION_COOKIE}=${auth.sessionCookie}`,
    Accept: 'application/json',
  };
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    // Mutating routes run behind the Idempotency-Key middleware; the browser
    // client stamps one automatically, so a hand-rolled call must too.
    headers['Idempotency-Key'] = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return (json as { data: T }).data;
}

/*
 * THE SEED, AND WHY IT IS SHAPED LIKE THIS
 * ----------------------------------------
 * The obvious move on a shared account is "create a uniquely-named outlet every
 * run and assert its name renders". It does not work here, and the reason is
 * worth writing down: gojo is on the FREE tier, which allows exactly ONE outlet
 * and fifty products (backend/src/lib/billing.ts). The second run comes back
 *
 *     403 LIMIT_REACHED — "Your Free plan allows up to 1 outlets."
 *
 * — the exact shared-state rot this rework exists to remove, just relocated from
 * the assertions into the fixture. Growing rows per run is not durable.
 *
 * So the outlet and the product are ENSURED, not created: fixed names, made once,
 * reused forever, zero growth. The run-unique object is the SALE — sales carry no
 * plan cap — and it supplies TWO strings that cannot exist in the client bundle:
 *
 *   - the receipt number, minted by the SERVER off the outlet's receiptSeq, so it
 *     is a different value on every single run (INV-000002, INV-000003, …);
 *   - a random rupiah total we ring the sale up for.
 *
 * Both are therefore state-independent: they hold on run 1 and on run 500, and
 * they can only reach the screen through a live authenticated read.
 */

const GATE_OUTLET_NAME = 'E2E Gate Outlet';
const GATE_PRODUCT_NAME = 'E2E Gate Product';

/** The account's outlet. Free tier allows exactly one, so reuse whatever is
 *  there and only create when the account has none. */
async function ensureGateOutlet(auth: TestAuth): Promise<{ id: string; name: string }> {
  const { outlets } = await apiAs<{ outlets: { id: string; name: string }[] }>(
    auth,
    '/outlets',
  );
  if (outlets.length > 0) return outlets[0];
  const { outlet } = await apiAs<{ outlet: { id: string; name: string } }>(auth, '/outlets', {
    method: 'POST',
    body: { name: GATE_OUTLET_NAME },
  });
  return outlet;
}

/** A single reusable product to ring up. Matched by name so repeated runs don't
 *  march the account toward the 50-product cap. */
async function ensureGateVariantId(auth: TestAuth): Promise<string> {
  const { products } = await apiAs<{
    products: { id: string; name: string; variants: { id: string }[] }[];
  }>(auth, '/products?limit=100');

  const existing = products.find((p) => p.name === GATE_PRODUCT_NAME);
  const variantId = existing?.variants?.[0]?.id;
  if (variantId) return variantId;

  const { product } = await apiAs<{ product: { variants: { id: string }[] } }>(
    auth,
    '/products',
    {
      method: 'POST',
      body: { name: GATE_PRODUCT_NAME, variants: [{ name: 'Default', price: 10_000 }] },
    },
  );
  const created = product.variants[0]?.id;
  if (!created) throw new Error('gate product came back with no variant');
  return created;
}

export interface SeededSale {
  /** Server-minted receipt number — a NEW value every run (per-outlet sequence). */
  receiptNumber: string;
  /** Run-unique rupiah total. Its digits appear in the sale's row. */
  total: number;
}

/**
 * Ring up ONE real sale as gojo, for a run-unique amount, through the real
 * authenticated API. Overselling is allowed by design (backend/src/lib/sell.ts),
 * so this needs no stock movement to go through.
 */
export async function seedSale(auth: TestAuth): Promise<SeededSale> {
  const outlet = await ensureGateOutlet(auth);
  const variantId = await ensureGateVariantId(auth);

  // A random 5-6 digit rupiah amount, overriding the variant's list price. In
  // practice unique to this run; either way it is minted here, at runtime.
  const total = 10_000 + Math.floor(Math.random() * 89_999);

  const { sale } = await apiAs<{ sale: { id: string; number: string; total: number } }>(
    auth,
    '/sales',
    {
      method: 'POST',
      body: {
        outletId: outlet.id,
        items: [{ variantId, quantity: 1, unitPrice: total }],
        payments: [{ method: 'CASH', amount: total, tendered: total }],
        status: 'COMPLETED',
      },
    },
  );

  return { receiptNumber: sale.number, total: sale.total };
}

/** Plant the session cookie, then navigate. The dashboard route-group layout
 *  is a SERVER-side gate — it redirects to /login when the cookie is missing
 *  or does not resolve — so the cookie has to exist before the first request. */
export async function authenticateAndNavigate(
  page: Page,
  auth: TestAuth,
  path: string,
): Promise<void> {
  await page.context().addCookies([
    {
      name: SESSION_COOKIE,
      value: auth.sessionCookie,
      domain: frontendHostname(),
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: frontendIsHttps(),
    },
  ]);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}
