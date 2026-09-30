import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { parseIni } from '@forjio/sdk';

// `malapos auth login | whoami | logout` end to end over a stubbed fetch: a fake
// Huudis (discovery → device_authorization → token → userinfo) and a fake API.
// HOME points at a temp dir, so ~/.malapos/credentials is real.

const API = 'https://malapos.com/api/v1';
const ISSUER = 'https://idp.test';
const ENV_KEYS = ['MALAPOS_TOKEN', 'MALAPOS_BASE_URL', 'MALAPOS_HUUDIS_ISSUER', 'MALAPOS_CLI_CLIENT_ID', 'MALAPOS_PROFILE', 'HOME'];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

interface Call {
  url: string;
  method: string;
  auth: string | null;
  body: string | undefined;
}

let home: string;
let calls: Call[];
let stdout: string[];
let stderr: string[];
let tokenPolls: number;

function huudis(url: string, init: RequestInit): { status: number; body: unknown } | null {
  if (url === `${ISSUER}/.well-known/openid-configuration`) {
    return {
      status: 200,
      body: {
        issuer: ISSUER,
        device_authorization_endpoint: `${ISSUER}/device_authorization`,
        token_endpoint: `${ISSUER}/token`,
        userinfo_endpoint: `${ISSUER}/userinfo`,
        jwks_uri: `${ISSUER}/jwks`,
      },
    };
  }
  if (url === `${ISSUER}/device_authorization`) {
    return {
      status: 200,
      body: {
        device_code: 'dev_123',
        user_code: 'ABCD-EFGH',
        verification_uri: `${ISSUER}/device`,
        verification_uri_complete: `${ISSUER}/device?user_code=ABCD-EFGH`,
        expires_in: 600,
        interval: 0,
      },
    };
  }
  if (url === `${ISSUER}/token`) {
    const form = new URLSearchParams(String(init.body));
    if (form.get('grant_type') === 'refresh_token') {
      return { status: 200, body: { access_token: 'at_refreshed', refresh_token: 'rt_2', expires_in: 900, token_type: 'Bearer' } };
    }
    tokenPolls++;
    if (tokenPolls === 1) return { status: 400, body: { error: 'authorization_pending' } };
    return {
      status: 200,
      body: { access_token: 'at_device', refresh_token: 'rt_1', expires_in: 900, token_type: 'Bearer', scope: 'openid profile email' },
    };
  }
  if (url === `${ISSUER}/userinfo`) {
    return { status: 200, body: { sub: 'usr_1', email: 'dev@example.com', email_verified: true } };
  }
  return null;
}

function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input);
      calls.push({
        url,
        method: init.method ?? 'GET',
        auth: new Headers(init.headers).get('authorization'),
        body: init.body === undefined ? undefined : String(init.body),
      });
      const r = huudis(url, init) ?? (url.startsWith(API) ? { status: 200, body: { data: [], error: null, meta: {} } } : null);
      if (!r) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
    }),
  );
}

class Exit extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

/** A fresh CLI per run (commander keeps option values), with src/index.ts's root flags. */
async function run(args: string[]): Promise<number> {
  vi.resetModules();
  const { auth } = await import('../commands/auth.js');
  const { buildApiCommand } = await import('../commands/api.generated.js');
  const program = new Command()
    .name('malapos')
    .option('--json')
    .option('--profile <name>')
    .option('--base-url <url>')
    .option('--no-color')
    .exitOverride();
  program.addCommand(auth);
  program.addCommand(buildApiCommand());
  process.exitCode = undefined;
  try {
    await program.parseAsync(args, { from: 'user' });
  } catch (e) {
    if (e instanceof Exit) return e.code;
    throw e;
  }
  return Number(process.exitCode ?? 0);
}

/** A GET route with no path parameters or required query, to prove which bearer is sent. */
async function simpleGet(): Promise<{ args: string[]; path: string }> {
  const { API_ROUTES } = await import('../commands/api.generated.js');
  for (const area of API_ROUTES) {
    for (const r of area.routes) {
      if (r.method === 'GET' && r.pathParams.length === 0 && r.query.every((q) => !q.required)) {
        return { args: ['api', area.area, r.name], path: r.path };
      }
    }
  }
  throw new Error('no simple GET route');
}

const credFile = (): string => path.join(home, '.malapos', 'credentials');
const profiles = (): Record<string, Record<string, string>> => parseIni(fs.readFileSync(credFile(), 'utf8'));
const apiCall = (): Call => calls.find((c) => c.url.startsWith(API))!;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'malapos-auth-'));
  process.env.HOME = home;
  for (const k of ['MALAPOS_TOKEN', 'MALAPOS_BASE_URL', 'MALAPOS_CLI_CLIENT_ID', 'MALAPOS_PROFILE']) delete process.env[k];
  process.env.MALAPOS_HUUDIS_ISSUER = ISSUER;
  calls = [];
  stdout = [];
  stderr = [];
  tokenPolls = 0;
  stubFetch();
  vi.spyOn(process.stdout, 'write').mockImplementation((s) => (stdout.push(String(s)), true));
  vi.spyOn(process.stderr, 'write').mockImplementation((s) => (stderr.push(String(s)), true));
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Exit(code ?? 0);
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k];
  }
  fs.rmSync(home, { recursive: true, force: true });
});

describe('malapos auth login --api-key', () => {
  it('saves the key in the profile (0600) and the next api call sends it as the bearer', async () => {
    expect(await run(['auth', 'login', '--api-key', 'sk_live_abcdef123456'])).toBe(0);
    expect(profiles().default).toMatchObject({ api_key: 'sk_live_abcdef123456' });
    expect(fs.statSync(credFile()).mode & 0o777).toBe(0o600);
    expect(stdout.join('')).toContain('sk_live_…3456');
    expect(stdout.join('')).not.toContain('sk_live_abcdef123456');

    const { args, path: routePath } = await simpleGet();
    expect(await run(args)).toBe(0);
    expect(apiCall().url).toBe(`https://malapos.com${routePath}`);
    expect(apiCall().auth).toBe('Bearer sk_live_abcdef123456');
  });

  it('reads the key from stdin with --api-key -, per --profile', async () => {
    const stdin = Object.getOwnPropertyDescriptor(process, 'stdin')!;
    Object.defineProperty(process, 'stdin', { value: Readable.from(['sk_live_fromstdin99\n']), configurable: true });
    try {
      expect(await run(['--profile', 'ci', 'auth', 'login', '--api-key', '-'])).toBe(0);
    } finally {
      Object.defineProperty(process, 'stdin', stdin);
    }
    expect(profiles()).toEqual({ ci: expect.objectContaining({ api_key: 'sk_live_fromstdin99' }) });
  });

  it('still lets MALAPOS_TOKEN win over the saved key', async () => {
    await run(['auth', 'login', '--api-key', 'sk_live_saved000000']);
    process.env.MALAPOS_TOKEN = 'sk_live_fromenv00000';
    const { args } = await simpleGet();
    await run(args);
    expect(apiCall().auth).toBe('Bearer sk_live_fromenv00000');
  });
});

describe('malapos auth login (device flow)', () => {
  it('discovery → device_authorization → pending → token, then saves the session', async () => {
    expect(await run(['--json', 'auth', 'login', '--no-browser'])).toBe(0);

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${ISSUER}/.well-known/openid-configuration`,
      `POST ${ISSUER}/device_authorization`,
      `POST ${ISSUER}/token`,
      `POST ${ISSUER}/token`,
      `GET ${ISSUER}/userinfo`,
    ]);
    const start = new URLSearchParams(calls[1]!.body);
    expect(start.get('client_id')).toBe('malapos-cli');
    expect(start.get('scope')).toBe('openid profile email');
    expect(new URLSearchParams(calls[3]!.body).get('device_code')).toBe('dev_123');
    expect(stderr.join('')).toContain('ABCD-EFGH'); // shown even with --json

    expect(profiles().default).toMatchObject({
      access_token: 'at_device',
      refresh_token: 'rt_1',
      issuer: ISSUER,
      client_id: 'malapos-cli',
    });
    expect(JSON.parse(stdout.join(''))).toMatchObject({ ok: true, mode: 'session', email: 'dev@example.com' });

    calls = [];
    const { args } = await simpleGet();
    await run(args);
    expect(apiCall().auth).toBe('Bearer at_device');
  });

  it('a device login replaces a saved API key in that profile', async () => {
    await run(['auth', 'login', '--api-key', 'sk_live_abcdef123456']);
    await run(['auth', 'login', '--no-browser']);
    expect(profiles().default).not.toHaveProperty('api_key');
    expect(profiles().default).toMatchObject({ access_token: 'at_device' });
  });

  it('refreshes a stale session before calling the API', async () => {
    fs.mkdirSync(path.dirname(credFile()), { recursive: true });
    fs.writeFileSync(
      credFile(),
      `[default]\naccess_token = at_old\nrefresh_token = rt_old\nexpires_at = ${Math.floor(Date.now() / 1000) - 10}\nissuer = ${ISSUER}\nclient_id = malapos-cli\n`,
    );
    const { args } = await simpleGet();
    await run(args);
    const refresh = calls.find((c) => c.url === `${ISSUER}/token`)!;
    expect(new URLSearchParams(refresh.body).get('grant_type')).toBe('refresh_token');
    expect(apiCall().auth).toBe('Bearer at_refreshed');
    expect(profiles().default).toMatchObject({ access_token: 'at_refreshed', refresh_token: 'rt_2' });
  });
});

describe('malapos auth whoami / logout', () => {
  it('whoami names the Huudis user for a session', async () => {
    await run(['auth', 'login', '--no-browser']);
    stdout = [];
    expect(await run(['--json', 'auth', 'whoami'])).toBe(0);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      authenticated: true,
      mode: 'session',
      sub: 'usr_1',
      email: 'dev@example.com',
      issuer: ISSUER,
    });
  });

  it('whoami shows only a hint of a saved API key', async () => {
    await run(['auth', 'login', '--api-key', 'sk_live_abcdef123456']);
    stdout = [];
    expect(await run(['auth', 'whoami'])).toBe(0);
    expect(stdout.join('')).toContain('API key');
    expect(stdout.join('')).toContain('sk_live_…3456');
    expect(stdout.join('')).not.toContain('sk_live_abcdef123456');
  });

  it('logout deletes the profile, after which whoami says not signed in', async () => {
    await run(['auth', 'login', '--api-key', 'sk_live_abcdef123456']);
    stdout = [];
    expect(await run(['--json', 'auth', 'logout'])).toBe(0);
    expect(JSON.parse(stdout.join(''))).toMatchObject({ ok: true, cleared: true });
    expect(fs.existsSync(credFile())).toBe(false);
    stdout = [];
    expect(await run(['--json', 'auth', 'whoami'])).toBe(1);
    expect(JSON.parse(stdout.join(''))).toEqual({ authenticated: false, profile: 'default' });
  });

  it('an api call with no credentials exits 1 before calling the API', async () => {
    const { args } = await simpleGet();
    expect(await run(args)).toBe(1);
    expect(stderr.join('')).toContain('Not signed in');
    expect(calls.some((c) => c.url.startsWith(API))).toBe(false);
  });
});
