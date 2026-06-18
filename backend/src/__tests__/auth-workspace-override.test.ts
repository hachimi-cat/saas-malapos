import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

/*
 * Middleware-level contract test for the workspace-override resolution
 * in `requireAuth` (Path 0, the BFF session path) — specifically the
 * STALE-SESSION class (serront round 4): `accountIds` are snapshotted
 * at LOGIN, so a workspace the user joins/creates AFTER sign-in is in
 * the switcher's live list but not the session. The middleware must
 * re-check live Huudis membership before falling back, and FAIL CLOSED
 * (default account) on non-membership / upstream error / timeout.
 *
 * The session cookie is minted with the real codec from auth-config so
 * `resolveSessionForRequest` exercises the production decode path; the
 * live-membership fetch to Huudis is the only thing stubbed.
 */

import { requireAuth } from '../middleware/auth.js';
import { authConfig } from '../auth-config.js';

const SESSION_COOKIE = 'malapos_session';
const OVERRIDE_COOKIE = 'malapos_active_workspace';

function mintSession(overrides: Record<string, unknown> = {}): string {
  return authConfig.codec.encode({
    accountId: 'acc_personal',
    email: 'merchant@example.com',
    name: 'Test Merchant',
    huudisSub: 'huudis|u1',
    role: 'merchant',
    huudisAccessToken: 'at_live_check',
    accountIds: ['acc_personal', 'wks_snapshotted'],
    ...overrides,
  });
}

function makeApp() {
  const app = express();
  app.get('/whoami', requireAuth, (req, res) => {
    res.json({ accountId: req.auth?.accountId, sub: req.auth?.sub });
  });
  return app;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requireAuth — workspace override (BFF Path 0)', () => {
  it('honors an override already in the session snapshot — no live call', async () => {
    const res = await request(makeApp())
      .get('/whoami')
      .set('Cookie', `${SESSION_COOKIE}=${mintSession()}; ${OVERRIDE_COOKIE}=wks_snapshotted`);
    expect(res.status).toBe(200);
    expect(res.body.accountId).toBe('wks_snapshotted');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('honors a post-login workspace via live Huudis membership re-check', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'acc_personal' }, { id: 'wks_created_after_login' }] }),
    });
    const res = await request(makeApp())
      .get('/whoami')
      .set(
        'Cookie',
        `${SESSION_COOKIE}=${mintSession()}; ${OVERRIDE_COOKIE}=wks_created_after_login`
      );
    expect(res.status).toBe(200);
    expect(res.body.accountId).toBe('wks_created_after_login');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toContain('/api/v1/account/workspaces');
    expect(init.headers.Authorization).toBe('Bearer at_live_check');
  });

  it('fails closed to the default account when live membership denies the override', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'acc_personal' }, { id: 'wks_other' }] }),
    });
    const res = await request(makeApp())
      .get('/whoami')
      .set('Cookie', `${SESSION_COOKIE}=${mintSession()}; ${OVERRIDE_COOKIE}=wks_not_mine`);
    expect(res.status).toBe(200);
    expect(res.body.accountId).toBe('acc_personal');
  });

  it('fails closed when the live check errors (network / timeout)', async () => {
    fetchMock.mockRejectedValue(new Error('fetch failed'));
    const res = await request(makeApp())
      .get('/whoami')
      .set('Cookie', `${SESSION_COOKIE}=${mintSession()}; ${OVERRIDE_COOKIE}=wks_unknown`);
    expect(res.status).toBe(200);
    expect(res.body.accountId).toBe('acc_personal');
  });

  it('fails closed when Huudis answers non-2xx', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const res = await request(makeApp())
      .get('/whoami')
      .set('Cookie', `${SESSION_COOKIE}=${mintSession()}; ${OVERRIDE_COOKIE}=wks_unknown`);
    expect(res.status).toBe(200);
    expect(res.body.accountId).toBe('acc_personal');
  });

  it('skips the live check entirely when the session has no Huudis access token', async () => {
    const res = await request(makeApp())
      .get('/whoami')
      .set(
        'Cookie',
        `${SESSION_COOKIE}=${mintSession({ huudisAccessToken: undefined })}; ${OVERRIDE_COOKIE}=wks_unknown`
      );
    expect(res.status).toBe(200);
    expect(res.body.accountId).toBe('acc_personal');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
