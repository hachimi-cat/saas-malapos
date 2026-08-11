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
 *   - DENIED beats everything: provider credentials
 *     (/payments/plugipay-settings) are not even readable.
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

  it('provider credentials are not even readable: plugipay-settings → 403', async () => {
    const res = await request(makeApp())
      .get('/api/v1/payments/plugipay-settings/adapters')
      .set('Authorization', `Delegation ${token(true)}`);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/not available to delegated agents/i);
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

  it('a garbage token is a 401, not a 500', async () => {
    const res = await request(makeApp())
      .get('/api/v1/categories')
      .set('Authorization', 'Delegation mpdt_garbage.nope');
    expect(res.status).toBe(401);
  });
});
