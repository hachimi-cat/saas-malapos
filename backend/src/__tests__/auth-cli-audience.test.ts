import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import request from 'supertest';
import { SignJWT, exportJWK, generateKeyPair, type KeyLike } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/*
 * Bearer JWTs minted for the CLI's public OIDC client. Huudis stamps `aud`
 * with the client a token was minted for, so `malapos auth login` (device flow,
 * client `malapos-cli`) yields aud=malapos-cli — accepted next to aud=malapos. Real ES256
 * signatures, verified by the real requireAuth against a local JWKS served
 * at `${issuer}/jwks.json`; nothing about verification is mocked.
 */

const BRAND = 'malapos';
const ENV_KEYS = ['HUUDIS_ISSUER', 'HUUDIS_AUDIENCE', 'HUUDIS_CLI_AUDIENCE'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

let server: Server;
let issuer: string;
let key: KeyLike;
let app: Express;

async function load(): Promise<Express> {
  vi.resetModules();
  const { requireAuth } = await import('../middleware/auth.js');
  const a = express();
  a.get('/whoami', requireAuth, (req, res) => {
    res.json({ sub: req.auth?.sub, accountId: req.auth?.accountId, aud: req.auth?.aud });
  });
  return a;
}

function token(over: { aud?: string; sub?: string; iss?: string }): Promise<string> {
  const jwt = new SignJWT({ accountId: 'acc_1', identityId: over.sub ?? 'usr_allowed', identityType: 'user', scope: 'openid profile email', mfaVerified: false })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setIssuer(over.iss ?? issuer)
    .setSubject(over.sub ?? 'usr_allowed')
    .setIssuedAt()
    .setExpirationTime('5m');
  if (over.aud !== undefined) jwt.setAudience(over.aud);
  return jwt.sign(key);
}

const call = (t: string) => request(app).get('/whoami').set('Authorization', `Bearer ${t}`);

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  key = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
  server = createServer((req, res) => {
    if (req.url === '/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [jwk] }));
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.HUUDIS_ISSUER = issuer;
  delete process.env.HUUDIS_AUDIENCE;
  delete process.env.HUUDIS_CLI_AUDIENCE;
  app = await load();
});

afterAll(async () => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await new Promise<void>((r) => server.close(() => r()));
});

describe('requireAuth — Huudis Bearer audiences', () => {
  it('accepts aud=<brand> (the primary audience)', async () => {
    const res = await call(await token({ aud: BRAND }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sub: 'usr_allowed', accountId: 'acc_1', aud: BRAND });
  });

  it('accepts aud=<brand>-cli (the CLI device flow)', async () => {
    const res = await call(await token({ aud: `${BRAND}-cli` }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sub: 'usr_allowed', accountId: 'acc_1', aud: `${BRAND}-cli` });
  });

  it("refuses another product's token, and another product's CLI token (401)", async () => {
    for (const aud of ['storlaunch', 'storlaunch-cli', `${BRAND}-dashboard`]) {
      const res = await call(await token({ aud }));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    }
  });

  it('refuses a token with no aud (401)', async () => {
    const res = await call(await token({}));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('refuses a <brand>-cli token from another issuer (401)', async () => {
    const res = await call(await token({ aud: `${BRAND}-cli`, iss: 'https://evil.example' }));
    expect(res.status).toBe(401);
  });

  it('HUUDIS_CLI_AUDIENCE overrides the CLI client id, and empty turns CLI tokens off', async () => {
    try {
      process.env.HUUDIS_CLI_AUDIENCE = 'other-cli';
      const custom = await load();
      expect((await request(custom).get('/whoami').set('Authorization', `Bearer ${await token({ aud: 'other-cli' })}`)).status).toBe(200);
      expect((await request(custom).get('/whoami').set('Authorization', `Bearer ${await token({ aud: `${BRAND}-cli` })}`)).status).toBe(401);

      process.env.HUUDIS_CLI_AUDIENCE = '';
      const off = await load();
      expect((await request(off).get('/whoami').set('Authorization', `Bearer ${await token({ aud: `${BRAND}-cli` })}`)).status).toBe(401);
      expect((await request(off).get('/whoami').set('Authorization', `Bearer ${await token({ aud: BRAND })}`)).status).toBe(200);
    } finally {
      delete process.env.HUUDIS_CLI_AUDIENCE;
    }
  });
});
