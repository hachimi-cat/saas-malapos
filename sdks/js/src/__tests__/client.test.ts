import { afterEach, describe, expect, it } from 'vitest';
import { MalaposClient, MalaposError, type Page } from '../index.js';

// client.api: every feature route, generated from the API spec (scripts/apigen.sh).
// Each call is `Authorization: Bearer <sk_live_ key or Huudis token>`, unwraps the
// {data, error, meta} envelope and throws MalaposError on failure.

interface Seen { url: string; method: string; body?: string; headers: Headers }

function capture(status = 200, envelope: unknown = { data: { ok: true }, error: null, meta: { requestId: 'r', timestamp: '' } }) {
  const seen: Seen[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({
      url: typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
      headers: new Headers(init?.headers),
    });
    return new Response(envelope === null ? null : JSON.stringify(envelope), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { seen, fetchImpl };
}

const realEnv = { ...process.env };
afterEach(() => {
  process.env = { ...realEnv };
});

describe('client.api (generated from the spec)', () => {
  it('creates a product with the fields Malapos validates, with the Bearer key', async () => {
    const { seen, fetchImpl } = capture(201, { data: { id: 'prd_1' }, error: null, meta: { requestId: 'r' } });
    const client = new MalaposClient({ token: 'sk_live_test', baseUrl: 'https://malapos.test', fetch: fetchImpl });
    const out = await client.api.productsCreate({ name: 'Kopi susu', kind: 'GOODS', variants: [{ name: 'Default', price: 18000 }] });
    expect(out).toEqual({ id: 'prd_1' });
    const r = seen[0]!;
    expect(r.method).toBe('POST');
    expect(r.url).toBe('https://malapos.test/api/v1/products');
    expect(JSON.parse(r.body!)).toEqual({ name: 'Kopi susu', kind: 'GOODS', variants: [{ name: 'Default', price: 18000 }] });
    expect(r.headers.get('authorization')).toBe('Bearer sk_live_test');
    expect(r.headers.get('content-type')).toBe('application/json');
  });

  it('puts path parameters in the path and query fields in the query', async () => {
    const { seen, fetchImpl } = capture();
    const client = new MalaposClient({ token: 'sk_live_test', baseUrl: 'https://malapos.test', fetch: fetchImpl });
    await client.api.salesVoid('sale 1/2', { reason: 'wrong item' });
    await client.api.productsList({ q: 'kopi susu', active: true });
    expect(seen[0]!.url).toBe('https://malapos.test/api/v1/sales/sale%201%2F2/void');
    expect(JSON.parse(seen[0]!.body!)).toEqual({ reason: 'wrong item' });
    const listed = new URL(seen[1]!.url);
    expect(listed.pathname).toBe('/api/v1/products');
    expect(Object.fromEntries(listed.searchParams)).toEqual({ q: 'kopi susu', active: 'true' });
    expect(seen[1]!.body).toBeUndefined();
  });

  it('sends a whole body on a route whose fields the spec does not know', async () => {
    const { seen, fetchImpl } = capture();
    const client = new MalaposClient({ token: 'sk_live_test', baseUrl: 'https://malapos.test', fetch: fetchImpl });
    await client.api.deliveryRates({ destination: { postalCode: '12345' }, items: [{ weight: 500 }] });
    expect(JSON.parse(seen[0]!.body!)).toEqual({ destination: { postalCode: '12345' }, items: [{ weight: 500 }] });
  });

  it('has a method for every feature route', () => {
    const client = new MalaposClient({ token: 't' });
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(client.api)).filter((n) => n !== 'constructor' && n !== 'call');
    expect(methods.length).toBeGreaterThan(230);
  });
});

describe('MalaposClient', () => {
  it('reads the token and base URL from the environment', async () => {
    process.env.MALAPOS_TOKEN = 'sk_live_env';
    process.env.MALAPOS_BASE_URL = 'https://staging.malapos.test/';
    const { seen, fetchImpl } = capture();
    await new MalaposClient({ fetch: fetchImpl }).api.outletsList();
    expect(seen[0]!.url).toBe('https://staging.malapos.test/api/v1/outlets');
    expect(seen[0]!.headers.get('authorization')).toBe('Bearer sk_live_env');
  });

  it('returns a paging list with its cursor and hasMore', async () => {
    const { fetchImpl } = capture(200, { data: [{ id: 'cus_1' }], error: null, meta: { requestId: 'r', cursor: 'c_2', hasMore: true } });
    const client = new MalaposClient({ token: 'sk_live_test', baseUrl: 'https://malapos.test', fetch: fetchImpl });
    const page = (await client.api.paymentsCustomers({ limit: 1 })) as Page<{ id: string }>;
    expect([...page]).toEqual([{ id: 'cus_1' }]);
    expect(page.cursor).toBe('c_2');
    expect(page.hasMore).toBe(true);
    expect(JSON.stringify(page)).toBe('[{"id":"cus_1"}]');
  });

  it('throws MalaposError with the envelope code, status and request id', async () => {
    const { fetchImpl } = capture(404, { data: null, error: { code: 'NOT_FOUND', message: 'Sale not found', param: 'id' }, meta: { requestId: 'req_9' } });
    const client = new MalaposClient({ token: 'sk_live_test', baseUrl: 'https://malapos.test', fetch: fetchImpl });
    const err = await client.api.salesGet('nope').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MalaposError);
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Sale not found', requestId: 'req_9', param: 'id' });
  });

  it('says how to configure a token on a 401 without one', async () => {
    delete process.env.MALAPOS_TOKEN;
    const { seen, fetchImpl } = capture(401, { data: null, error: { code: 'AUTH_REQUIRED', message: 'Missing Authorization header' }, meta: {} });
    const client = new MalaposClient({ baseUrl: 'https://malapos.test', fetch: fetchImpl });
    const err = (await client.api.outletsList().catch((e: unknown) => e)) as MalaposError;
    expect(seen[0]!.headers.get('authorization')).toBeNull();
    expect(err.code).toBe('AUTH_REQUIRED');
    expect(err.message).toContain('MALAPOS_TOKEN');
  });

  it('handles an empty 204 and a non-JSON error', async () => {
    const empty = capture(204, null);
    const client = new MalaposClient({ token: 't', baseUrl: 'https://malapos.test', fetch: empty.fetchImpl });
    expect(await client.request('DELETE', '/api/v1/api-keys/k1')).toBeNull();

    const html = (async () => new Response('<html>bad gateway</html>', { status: 502 })) as typeof fetch;
    const broken = new MalaposClient({ token: 't', baseUrl: 'https://malapos.test', fetch: html });
    await expect(broken.request('GET', '/api/v1/outlets')).rejects.toMatchObject({ status: 502, code: 'INVALID_RESPONSE' });
  });
});
