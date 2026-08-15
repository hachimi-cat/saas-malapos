import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mintDelegationToken } from '@forjio/catentio-embed';

/*
 * Middleware-level contract test for the delegation gate (Path 3 in
 * requireAuth) — the auth half of the `approvalRequired` model:
 *
 *   - ALLOWED paths grant READS (gather) — including the books
 *     (/sales, /inventory, /reports), which the assistant must read to
 *     propose a refund or answer "what is low".
 *   - Writes additionally need DELEGATION_WRITABLE_PATHS. The books and
 *     every money surface are deliberately absent there, so even a
 *     write-bit (auto-apply) token gets a 403 on POST /sales/:id/refund.
 *   - DENIED beats everything: provider CREDENTIALS (the four
 *     secret-bearing /plugipay-settings/adapters/* paths) are not even
 *     readable, while the merchant-facing settings beside them are.
 *
 * The middleware matches `${req.baseUrl}${req.path}`, so the handlers
 * here are registered as a catch-all (baseUrl '') and the assertion is
 * purely: did the request get through the gate or which 403 stopped it.
 */

import { requireAuth } from '../middleware/auth.js';
import { MALAPOS_DELEGATION_PREFIX } from '../lib/catentio-profile.js';

const SECRET = 'test-delegation-secret';

function token(writes: boolean): string {
  return mintDelegationToken(
    {
      sub: 'huudis|u1',
      email: 'merchant@example.com',
      name: 'Test Merchant',
      workspaceId: 'acc_test',
      requestId: 'req_test',
      writes,
    },
    SECRET,
    { prefix: MALAPOS_DELEGATION_PREFIX },
  );
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.all(/.*/, requireAuth, (req, res) => {
    res.json({ reached: true, accountId: req.auth?.accountId });
  });
  return app;
}

type Verb = 'post' | 'patch' | 'put' | 'delete';

/** One write through the gate. A table of (method, path) pairs is the
 *  readable way to state a boundary, and supertest's per-verb methods
 *  are separate functions — so dispatch here, once, typed. */
function send(method: Verb, path: string) {
  const agent = request(makeApp());
  const call =
    method === 'post'
      ? agent.post(path)
      : method === 'patch'
        ? agent.patch(path)
        : method === 'put'
          ? agent.put(path)
          : agent.delete(path);
  return call.set('Authorization', `Delegation ${token(true)}`).send({});
}

beforeEach(() => {
  vi.stubEnv('CATENTIO_DELEGATION_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('delegation gate — read/write path split', () => {
  it('write-bit token READS the books: GET /api/v1/sales passes the gate', async () => {
    const res = await request(makeApp())
      .get('/api/v1/sales')
      .set('Authorization', `Delegation ${token(true)}`);
    expect(res.status).toBe(200);
    expect(res.body.reached).toBe(true);
    expect(res.body.accountId).toBe('acc_test');
  });

  it('write-bit token still cannot WRITE the books: POST refund → 403', async () => {
    const res = await request(makeApp())
      .post('/api/v1/sales/tx_1/refund')
      .set('Authorization', `Delegation ${token(true)}`)
      .send({ amount: 1000 });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/proposes changes here/i);
  });

  it('write-bit token cannot move stock: POST /api/v1/inventory/adjust → 403', async () => {
    const res = await request(makeApp())
      .post('/api/v1/inventory/adjust')
      .set('Authorization', `Delegation ${token(true)}`)
      .send({ outletId: 'out_1', variantId: 'var_1', qtyDelta: 5 });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/proposes changes here/i);
  });

  it('write-bit token WRITES configuration: POST /api/v1/categories passes', async () => {
    const res = await request(makeApp())
      .post('/api/v1/categories')
      .set('Authorization', `Delegation ${token(true)}`)
      .send({ name: 'Kopi' });
    expect(res.status).toBe(200);
    expect(res.body.reached).toBe(true);
  });

  it('reads aggregates: GET /api/v1/reports/summary passes', async () => {
    const res = await request(makeApp())
      .get('/api/v1/reports/summary')
      .set('Authorization', `Delegation ${token(true)}`);
    expect(res.status).toBe(200);
  });

  /*
   * PAYMENT SETTINGS — the boundary bang chose on 2026-08-14 (storlaunch
   * parity), replacing a blanket deny on the whole plugipay-settings
   * prefix. Deny the credentials, allow the configuration.
   *
   * The four secret paths and the settings beside them live under ONE
   * prefix, so both halves are asserted together: a deny that stopped
   * matching, or an allow that grew to swallow the adapters, has to
   * fail here rather than in production.
   */
  const SECRET_ADAPTERS = ['xendit', 'paypal', 'midtrans', 'managed'] as const;

  it.each(SECRET_ADAPTERS)(
    'provider credentials are not even readable: /adapters/%s → 403',
    async (kind) => {
      const res = await request(makeApp())
        .get(`/api/v1/payments/plugipay-settings/adapters/${kind}`)
        .set('Authorization', `Delegation ${token(true)}`);
      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/not available to delegated agents/i);
    },
  );

  it.each(SECRET_ADAPTERS)('and cannot be WRITTEN either: PUT /adapters/%s → 403', async (kind) => {
    const res = await request(makeApp())
      .put(`/api/v1/payments/plugipay-settings/adapters/${kind}`)
      .set('Authorization', `Delegation ${token(true)}`)
      .send({ secretKey: 'sk_live_should_never_reach_here' });
    expect(res.status).toBe(403);
    // DENIED short-circuits before the writable list is consulted, so
    // this is the allowlist's message, not the writable list's.
    expect(res.body.error.message).toMatch(/not available to delegated agents/i);
  });

  it('the settings BESIDE them are readable — the gather the sparkle needs', async () => {
    for (const path of [
      '/api/v1/payments/plugipay-settings/adapters',
      '/api/v1/payments/plugipay-settings/checkout/settings',
      '/api/v1/payments/plugipay-settings/templates',
    ]) {
      const res = await request(makeApp())
        .get(path)
        .set('Authorization', `Delegation ${token(true)}`);
      expect(res.status, `${path} should be readable`).toBe(200);
    }
  });

  it('the three declared settings writes pass, and nothing else under the prefix does', async () => {
    const granted: [Verb, string][] = [
      ['put', '/api/v1/payments/plugipay-settings/adapters/manual'],
      ['patch', '/api/v1/payments/plugipay-settings/checkout/settings'],
      ['post', '/api/v1/payments/plugipay-settings/templates'],
      ['patch', '/api/v1/payments/plugipay-settings/templates/tpl_1'],
    ];
    for (const [method, path] of granted) {
      const res = await send(method, path);
      expect(res.status, `${method.toUpperCase()} ${path} should be writable`).toBe(200);
    }

    // Everything else under the same prefix stays propose-only. The two
    // template lifecycle POSTs are the ones prefix inheritance would
    // have handed over for free — `exact: true` on the collection POST
    // is what keeps them out.
    const refused: [Verb, string][] = [
      ['post', '/api/v1/payments/plugipay-settings/templates/tpl_1/make-default'],
      ['post', '/api/v1/payments/plugipay-settings/templates/tpl_1/duplicate'],
      ['delete', '/api/v1/payments/plugipay-settings/templates/tpl_1'],
      ['put', '/api/v1/payments/plugipay-settings/adapters'],
    ];
    for (const [method, path] of refused) {
      const res = await send(method, path);
      expect(res.status, `${method.toUpperCase()} ${path} must stay propose-only`).toBe(403);
      expect(res.body.error.message).toMatch(/proposes changes here/i);
    }
  });

  it('the embed floor is inherited: /api/v1/api-keys → 403 denied', async () => {
    const res = await request(makeApp())
      .get('/api/v1/api-keys')
      .set('Authorization', `Delegation ${token(true)}`);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/not available to delegated agents/i);
  });

  it('review-mode (no write bit) token is refused ANY write, even on writable paths', async () => {
    const res = await request(makeApp())
      .post('/api/v1/categories')
      .set('Authorization', `Delegation ${token(false)}`)
      .send({ name: 'Kopi' });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/cannot write directly/i);
  });

  /*
   * WAVE 2 — the affiliate approval queue. The verbs are proposals, so
   * the whole model rests on the agent being able to GATHER the queue
   * first: an agent told to propose an approval but forbidden from
   * reading the pending rows has been given a job it cannot start
   * (the same flaw the read/write split above exists to avoid).
   */
  it.each([
    '/api/v1/account/marketing/programs',
    '/api/v1/account/marketing/programs/prog_1/enrollments',
    '/api/v1/account/marketing/programs/commissions?status=pending,approved',
  ])('the affiliate queue is READABLE: GET %s passes the gate', async (path) => {
    const res = await request(makeApp())
      .get(path)
      .set('Authorization', `Delegation ${token(true)}`);
    expect(res.status).toBe(200);
    expect(res.body.reached).toBe(true);
  });

  it('a garbage token is a 401, not a 500', async () => {
    const res = await request(makeApp())
      .get('/api/v1/categories')
      .set('Authorization', 'Delegation mpdt_garbage.nope');
    expect(res.status).toBe(401);
  });
});

/*
 * The METHOD axis (storlaunch's f0dd757 entry shape, adopted for the
 * 0.8.0 action vocabulary): an entry grants exactly the methods its
 * profile-advertised writes use. DELETE is writable NOWHERE — deletes
 * are declared destructive/approval actions the agent proposes on a
 * card and the merchant's own browser session applies. Same for the
 * payout mark-* transitions and the loyalty value POSTs.
 */
describe('delegation gate — method axis', () => {
  const cases: Array<[method: 'post' | 'patch' | 'put' | 'delete', path: string, pass: boolean]> = [
    // DELETE must not be writable anywhere — the routes exist.
    ['delete', '/api/v1/products/prod_1', false],
    ['delete', '/api/v1/categories/cat_1', false],
    ['delete', '/api/v1/customers/cus_1', false],
    ['delete', '/api/v1/webhook-subscriptions/whs_1', false],
    ['delete', '/api/v1/account/blog/posts/post_1', false],
    ['delete', '/api/v1/fulfillment/warehouses/wh_1', false],
    ['delete', '/api/v1/account/marketing/marketing-campaigns/cmp_1', false],
    // The granted method/path pairs keep working.
    ['post', '/api/v1/products', true],
    ['patch', '/api/v1/products/prod_1', true],
    ['put', '/api/v1/settings', true],
    ['patch', '/api/v1/account/feeds', true],
    ['post', '/api/v1/account/marketing/funnels', true],
    // 2026-08-15 — the Ripllo surfaces behind the channels and compose
    // sheets. Channels is configuration; a broadcast is a DRAFT.
    ['post', '/api/v1/account/marketing/channels', true],
    ['post', '/api/v1/account/marketing/broadcasts', true],
    // …and the three things deliberately left out beside them, each
    // because it reaches a real person:
    //   sending a broadcast (exact keeps the grant to the root),
    ['post', '/api/v1/account/marketing/broadcasts/bc_1/send', false],
    //   inviting a creator under the merchant's name,
    ['post', '/api/v1/account/marketing/campaigns/cmp_1/invitations', false],
    //   and accepting an application, which spins up a collaboration.
    ['post', '/api/v1/account/marketing/campaigns/cmp_1/applications/app_1/accept', false],
    ['patch', '/api/v1/delivery/origin', true],
    ['post', '/api/v1/delivery/rates', true],
    // WAVE 2 — the reconciled bulk route. It rode the products prefix
    // grant before anything declared it (invokable but undeclared);
    // products.set-category is the declaration that closes the gap, so
    // the grant is now advertised rather than incidental.
    ['post', '/api/v1/products/bulk-category', true],
    // The affiliate approval verbs are declared approvalRequired and
    // stay OFF the writable list — the passthrough grant covers only
    // marketing-campaigns and funnels under the same prefix.
    ['post', '/api/v1/account/marketing/programs/prog_1/enrollments/enr_1/approve', false],
    ['post', '/api/v1/account/marketing/programs/prog_1/enrollments/enr_1/reject', false],
    ['post', '/api/v1/account/marketing/programs/prog_1/commissions/com_1/approve', false],
    ['post', '/api/v1/account/marketing/programs/prog_1/commissions/com_1/void', false],
    // Blog publish/unpublish are declared DIRECT actions — the POST
    // subpaths ride the blog entry's prefix grant.
    ['post', '/api/v1/account/blog/posts/post_1/publish', true],
    ['post', '/api/v1/account/blog/posts/post_1/unpublish', true],
    // Payout money-state transitions stay propose-only: mark-paid is a
    // declared approvalRequired action, applied by the merchant.
    ['post', '/api/v1/payments/payouts/po_1/mark-paid', false],
    ['post', '/api/v1/payments/payouts/po_1/mark-in-transit', false],
    ['post', '/api/v1/payments/payouts', false],
    // Loyalty adjust/redeem move spendable value — the customers grant
    // is exact-POST (collection root) + PATCH, nothing under /{id}.
    ['post', '/api/v1/customers', true],
    ['patch', '/api/v1/customers/cus_1', true],
    ['post', '/api/v1/customers/cus_1/loyalty/adjust', false],
    ['post', '/api/v1/customers/cus_1/loyalty/redeem', false],
    // The layout canvas is not an agent surface.
    ['put', '/api/v1/tables/layout', false],
    // Recipes and modifier-group assignment are not profile-advertised.
    ['put', '/api/v1/products/prod_1/variants/var_1/recipe', false],
    ['put', '/api/v1/modifiers/product/prod_1', false],
  ];

  it.each(cases)('%s %s → %s', async (method, path, pass) => {
    const res = await request(makeApp())
      [method](path)
      .set('Authorization', `Delegation ${token(true)}`)
      .send({});
    if (pass) {
      expect(res.status).toBe(200);
      expect(res.body.reached).toBe(true);
    } else {
      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/proposes changes here/i);
    }
  });
});
