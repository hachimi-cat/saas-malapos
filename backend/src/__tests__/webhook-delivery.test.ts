import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

/*
 * Merchant webhooks, end to end against a real Postgres (CI's `test` job
 * migrates one; locally: DATABASE_URL=… npx prisma migrate deploy).
 *
 * A merchant subscribes an endpoint; an outbox event of its account goes
 * through the outbox worker (fan-out) and the delivery worker to a real HTTP
 * receiver on 127.0.0.1, signed so the JS SDK's own verifyWebhook accepts it.
 * Then: only subscribed types, never another account's events, the retry
 * schedule to give-up, the circuit breaker, the SSRF guard at registration and
 * at delivery, the delivery log the API lists, the event catalogue, retention,
 * and that production starts the workers.
 *
 * Only the auth is replaced (the account comes from a test header); prisma,
 * the workers and the routes are the real code.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);

const { prisma } = await import('../lib/db.js');
const { newId } = await import('../lib/ids.js');
const { EVENT_TYPES, eventMatches } = await import('../lib/event-types.js');
const { zodErrorHandler } = await import('../middleware/zod-error.js');
const { default: subscriptionsRouter } = await import('../routes/webhook-subscriptions.js');
const { processOutboxBatch } = await import('../services/outbox-worker.js');
const {
  deliverDueWebhooks, queueWebhookDeliveries, MAX_ATTEMPTS, RETRY_DELAYS_MS, pruneOldDeliveries,
} = await import('../services/webhook-delivery.js');
const { buildWebhookSignature } = await import('../lib/webhook-signature.js');
const { __setWebhookResolver } = await import('../lib/webhook-target.js');

// The JS SDK's verifier, loaded from source: the server's signature has to pass
// the helper merchants actually use. (Imported by path so tsc's rootDir stays src/.)
const sdkWebhooks = path.resolve(__dirname, '../../../sdks/js/src/webhooks.ts');
const { verifyWebhook } = (await import(/* @vite-ignore */ sdkWebhooks)) as {
  verifyWebhook: (o: { rawBody: string; signature: string | undefined; secret: string }) => {
    id: string; type: string; accountId: string; data: Record<string, unknown>;
  };
};

// ── a local receiver ────────────────────────────────────────────────
interface Received { path: string; headers: http.IncomingHttpHeaders; body: string }
const received: Received[] = [];
/** path → status to answer with (default 200). */
const answers = new Map<string, number>();
let receiver: http.Server;
let base = '';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    req.requestId = 'req_test';
    const accountId = req.header('x-test-account');
    if (accountId) req.auth = { accountId, sub: 'usr_test' } as never;
    next();
  });
  a.use('/api/v1/webhook-subscriptions', subscriptionsRouter);
  a.use(zodErrorHandler);
  return a;
}

const run = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
const accounts: string[] = [];
function account(tag: string) {
  const id = `acc_whtest_${run}_${tag}`;
  accounts.push(id);
  return id;
}

async function subscribe(accountId: string, body: Record<string, unknown>) {
  return request(app()).post('/api/v1/webhook-subscriptions').set('x-test-account', accountId).send(body);
}

async function emit(accountId: string | null, type: string, data: Record<string, unknown> = {}) {
  return prisma.outboxEvent.create({
    data: { id: newId('evt'), type, accountId, aggregateId: 'agg_test', occurredAt: new Date(), data: data as never },
  });
}

function hits(p: string) {
  return received.filter((r) => r.path === p);
}

describe.skipIf(!HAS_DB)('merchant webhooks (real database)', () => {
  beforeAll(async () => {
    receiver = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const p = req.url ?? '/';
        received.push({ path: p, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
        const status = answers.get(p) ?? 200;
        if (status >= 300 && status < 400) res.setHeader('Location', 'http://169.254.169.254/latest/meta-data/');
        res.statusCode = status;
        res.end(status === 200 ? 'ok' : 'nope');
      });
    });
    await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    received.length = 0;
    answers.clear();
    process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'true';
  });

  afterEach(async () => {
    __setWebhookResolver(null);
    delete process.env.WEBHOOK_DISABLE_AFTER_FAILURES;
    delete process.env.WEBHOOK_DISABLE_AFTER_HOURS;
    // Subscriptions cascade to their deliveries and attempts.
    await prisma.webhookSubscription.deleteMany({ where: { accountId: { in: accounts } } });
    await prisma.outboxEvent.updateMany({ where: { accountId: { in: accounts } }, data: { publishedAt: new Date() } });
  });

  afterAll(async () => {
    await prisma.webhookSubscription.deleteMany({ where: { accountId: { in: accounts } } });
    await prisma.outboxEvent.deleteMany({ where: { accountId: { in: accounts } } });
    delete process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
    await new Promise((r) => receiver.close(r));
    await prisma.$disconnect();
  });

  it('delivers an outbox event to a subscribed endpoint, signed so the SDK verifies it', async () => {
    const acc = account('deliver');
    const sub = await subscribe(acc, { url: `${base}/hook/deliver`, events: ['malapos.sale.*'] });
    expect(sub.status).toBe(201);
    const secret = sub.body.data.secret as string;
    const subscriptionId = sub.body.data.id as string;

    const ev = await emit(acc, 'malapos.sale.completed.v1', { transactionId: 'txn_1', note: 'kopi susu — 日本' });
    await processOutboxBatch();
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: ev.id } })).publishedAt).not.toBeNull();

    expect(await deliverDueWebhooks()).toBeGreaterThanOrEqual(1);
    const [hit] = hits('/hook/deliver');
    expect(hit).toBeDefined();
    expect(hits('/hook/deliver')).toHaveLength(1);

    const sig = hit!.headers['malapos-signature'] as string;
    expect(sig).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    const event = verifyWebhook({ rawBody: hit!.body, signature: sig, secret });
    expect(event.id).toBe(ev.id);
    expect(event.type).toBe('malapos.sale.completed.v1');
    expect(event.accountId).toBe(acc);
    expect(event.data).toEqual({ transactionId: 'txn_1', note: 'kopi susu — 日本' });
    expect(hit!.headers['malapos-event-id']).toBe(ev.id);
    expect(hit!.headers['malapos-event-type']).toBe('malapos.sale.completed.v1');
    expect(hit!.headers['malapos-delivery-attempt']).toBe('1');
    expect(() => verifyWebhook({ rawBody: hit!.body, signature: sig, secret: 'whsec_wrong' })).toThrow();

    const row = await prisma.webhookDelivery.findFirstOrThrow({ where: { subscriptionId }, include: { attemptLog: true } });
    expect(row).toMatchObject({ status: 'succeeded', attempts: 1, responseCode: 200, eventId: ev.id, nextRetryAt: null });
    expect(hit!.headers['malapos-delivery-id']).toBe(row.id);
    expect(row.deliveredAt).not.toBeNull();
    expect(row.attemptLog).toHaveLength(1);
    expect(row.attemptLog[0]).toMatchObject({ attemptNumber: 1, status: 'succeeded', responseCode: 200, error: null });

    // Handled again: nothing is queued twice.
    await queueWebhookDeliveries(ev);
    expect(await prisma.webhookDelivery.count({ where: { subscriptionId } })).toBe(1);
    expect(await deliverDueWebhooks()).toBe(0);
  });

  it('signs exactly like the SDK helpers expect (shared test vector)', () => {
    const body = '{"id":"evt_01jtestvector000000000000","type":"malapos.sale.completed.v1","occurredAt":"2026-01-01T00:00:00.000Z","accountId":"acc_test","data":{"transactionId":"txn_1","note":"kopi susu — 日本"}}';
    expect(buildWebhookSignature('whsec_malapos_test_vector_0001', body, 1767225600))
      .toBe('t=1767225600,v1=9cfe116208e8a8c7e414ba39612d7c4bc0b04a2e7762d254f741c8de908cfc5c');
  });

  it('queues only the event types a subscription names (exact, prefix, *), never for a paused one', async () => {
    const acc = account('subs');
    const sales = (await subscribe(acc, { url: `${base}/hook/sales`, events: ['malapos.sale.completed.v1'] })).body.data.id;
    const kds = (await subscribe(acc, { url: `${base}/hook/kds`, events: ['malapos.kds.*'] })).body.data.id;
    const everything = (await subscribe(acc, { url: `${base}/hook/all` })).body.data.id;
    const paused = (await subscribe(acc, { url: `${base}/hook/paused`, events: ['*'] })).body.data.id;
    await request(app()).patch(`/api/v1/webhook-subscriptions/${paused}`).set('x-test-account', acc).send({ active: false }).expect(200);

    for (const type of ['malapos.sale.completed.v1', 'malapos.sale.voided.v1', 'malapos.kds.advanced.v1', 'malapos.kds.served.v1', 'malapos.billing.subscribed.v1']) {
      await queueWebhookDeliveries(await emit(acc, type));
    }
    const typesFor = async (subscriptionId: string) =>
      (await prisma.webhookDelivery.findMany({ where: { subscriptionId }, select: { type: true } })).map((r) => r.type).sort();
    expect(await typesFor(sales)).toEqual(['malapos.sale.completed.v1']);
    expect(await typesFor(kds)).toEqual(['malapos.kds.advanced.v1', 'malapos.kds.served.v1']);
    expect(await typesFor(everything)).toHaveLength(5);
    expect(await typesFor(paused)).toEqual([]);

    await deliverDueWebhooks();
    expect(hits('/hook/sales').map((h) => h.headers['malapos-event-type'])).toEqual(['malapos.sale.completed.v1']);
    expect(hits('/hook/kds')).toHaveLength(2);
    expect(hits('/hook/paused')).toHaveLength(0);

    // A subscription made after an event happened does not receive it.
    const old = await emit(acc, 'malapos.sale.refunded.v1');
    const late = (await subscribe(acc, { url: `${base}/hook/late`, events: ['*'] })).body.data.id;
    await queueWebhookDeliveries({ ...old, occurredAt: new Date(Date.now() - 60_000) });
    expect(await typesFor(late)).toEqual([]);

    expect(eventMatches(['malapos.kds.*'], 'malapos.kdsx.served.v1')).toBe(false);
    expect(eventMatches(['malapos.*'], 'malapos.kds.served.v1')).toBe(true);
    expect(eventMatches('*', 'malapos.kds.served.v1')).toBe(false);

    // A prefix and a bad pattern at subscribe time.
    expect((await subscribe(acc, { url: `${base}/hook/p`, events: ['malapos.billing.*'] })).status).toBe(201);
    const bad = await subscribe(acc, { url: `${base}/hook/p`, events: ['sale.completed'] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it("never delivers one merchant's events to another merchant", async () => {
    const a = account('iso_a');
    const b = account('iso_b');
    const subA = (await subscribe(a, { url: `${base}/hook/a`, events: ['*'] })).body.data.id;
    const subB = (await subscribe(b, { url: `${base}/hook/b`, events: ['*'] })).body.data.id;

    const evA = await emit(a, 'malapos.sale.completed.v1', { transactionId: 'txn_a' });
    const platform = await emit(null, 'malapos.sale.completed.v1', { transactionId: 'platform' });
    await processOutboxBatch();
    await deliverDueWebhooks();
    await prisma.outboxEvent.delete({ where: { id: platform.id } });

    expect(await prisma.webhookDelivery.count({ where: { subscriptionId: subB } })).toBe(0);
    expect(await prisma.webhookDelivery.count({ where: { subscriptionId: subA } })).toBe(1);
    expect(hits('/hook/b')).toHaveLength(0);
    expect(hits('/hook/a').map((h) => JSON.parse(h.body).id)).toEqual([evA.id]);

    // …nor shows them in its delivery log, nor lets it read or retry them.
    const listB = await request(app()).get('/api/v1/webhook-subscriptions/deliveries').set('x-test-account', b);
    expect(listB.body.data).toEqual([]);
    const rowA = await prisma.webhookDelivery.findFirstOrThrow({ where: { subscriptionId: subA } });
    await request(app()).get(`/api/v1/webhook-subscriptions/deliveries/${rowA.id}`).set('x-test-account', b).expect(404);
    await request(app()).post(`/api/v1/webhook-subscriptions/deliveries/${rowA.id}/retry`).set('x-test-account', b).expect(404);
    await request(app()).patch(`/api/v1/webhook-subscriptions/${subA}`).set('x-test-account', b).send({ active: false }).expect(404);
  });

  it('retries a failing delivery on the backoff schedule, then gives up; a manual retry sends it again', async () => {
    const acc = account('retry');
    const subscriptionId = (await subscribe(acc, { url: `${base}/hook/flaky`, events: ['*'] })).body.data.id;
    answers.set('/hook/flaky', 503);
    await queueWebhookDeliveries(await emit(acc, 'malapos.sale.voided.v1', { transactionId: 'txn_1' }));

    let now = new Date();
    expect(await deliverDueWebhooks({ now })).toBe(1);
    let row = await prisma.webhookDelivery.findFirstOrThrow({ where: { subscriptionId } });
    expect(row).toMatchObject({ status: 'pending', attempts: 1, responseCode: 503, lastError: 'HTTP 503' });
    expect(row.nextRetryAt!.getTime() - row.lastAttemptAt!.getTime()).toBe(RETRY_DELAYS_MS[0]);

    // Not before it is due.
    expect(await deliverDueWebhooks({ now: new Date(now.getTime() + RETRY_DELAYS_MS[0]! - 1000) })).toBe(0);

    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
      now = row.nextRetryAt!;
      expect(await deliverDueWebhooks({ now })).toBe(1);
      row = await prisma.webhookDelivery.findFirstOrThrow({ where: { subscriptionId } });
      expect(row.attempts).toBe(attempt);
      if (attempt < MAX_ATTEMPTS) {
        expect(row.status).toBe('pending');
        expect(row.nextRetryAt!.getTime() - now.getTime()).toBe(RETRY_DELAYS_MS[attempt - 1]);
      }
    }
    expect(row).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS, nextRetryAt: null, lastError: 'HTTP 503' });
    expect(await deliverDueWebhooks({ now: new Date(now.getTime() + 7 * 24 * 3600_000) })).toBe(0);

    const tries = hits('/hook/flaky');
    expect(tries).toHaveLength(MAX_ATTEMPTS);
    expect(new Set(tries.map((t) => t.headers['malapos-event-id'])).size).toBe(1);
    expect(new Set(tries.map((t) => t.body)).size).toBe(1); // the same bytes every time
    expect(tries.map((t) => t.headers['malapos-delivery-attempt'])).toEqual(['1', '2', '3', '4', '5', '6']);

    // The delivery log shows every attempt.
    const list = await request(app())
      .get(`/api/v1/webhook-subscriptions/deliveries?subscriptionId=${subscriptionId}&status=failed`)
      .set('x-test-account', acc);
    expect(list.status).toBe(200);
    const [listed] = list.body.data;
    expect(listed.id).toBe(row.id);
    expect(listed.attemptLog.map((a: { attemptNumber: number }) => a.attemptNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(listed.attemptLog.every((a: { status: string; responseCode: number }) => a.status === 'failed' && a.responseCode === 503)).toBe(true);
    expect(listed.attemptLog[0].nextRetryAt).not.toBeNull();
    expect(listed.attemptLog[5].nextRetryAt).toBeNull();

    // Fixed on the merchant's side: retry by hand.
    answers.set('/hook/flaky', 200);
    const retried = await request(app()).post(`/api/v1/webhook-subscriptions/deliveries/${row.id}/retry`).set('x-test-account', acc);
    expect(retried.status).toBe(202);
    expect(retried.body.data.status).toBe('pending');
    const again = await request(app()).post(`/api/v1/webhook-subscriptions/deliveries/${row.id}/retry`).set('x-test-account', acc);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_QUEUED');
    expect(await deliverDueWebhooks()).toBe(1);
    const one = await request(app()).get(`/api/v1/webhook-subscriptions/deliveries/${row.id}`).set('x-test-account', acc);
    expect(one.body.data).toMatchObject({ status: 'succeeded', attempts: MAX_ATTEMPTS + 1, responseCode: 200 });
    expect(one.body.data.attemptLog.at(-1)).toMatchObject({ attemptNumber: MAX_ATTEMPTS + 1, status: 'succeeded' });
    const s = await prisma.webhookSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(s).toMatchObject({ consecutiveFailures: 0, failingSince: null, active: true });
  });

  it('pages the delivery log with meta.cursor', async () => {
    const acc = account('paging');
    await subscribe(acc, { url: `${base}/hook/page`, events: ['*'] });
    for (let i = 0; i < 5; i++) await queueWebhookDeliveries(await emit(acc, 'malapos.kds.advanced.v1', { i }));
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const res: request.Response = await request(app())
        .get(`/api/v1/webhook-subscriptions/deliveries?limit=2${cursor ? `&cursor=${cursor}` : ''}`)
        .set('x-test-account', acc);
      expect(res.status).toBe(200);
      seen.push(...res.body.data.map((d: { id: string }) => d.id));
      cursor = res.body.meta.cursor;
      if (!res.body.meta.hasMore) break;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('records a timeout, a redirect and a refused connection as failed attempts', async () => {
    const acc = account('modes');
    answers.set('/hook/redirect', 302);
    const redirect = (await subscribe(acc, { url: `${base}/hook/redirect`, events: ['*'] })).body.data.id;
    const closed = http.createServer();
    await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
    const deadPort = (closed.address() as AddressInfo).port;
    await new Promise((r) => closed.close(r));
    const refused = (await subscribe(acc, { url: `http://127.0.0.1:${deadPort}/x`, events: ['*'] })).body.data.id;
    const silent = http.createServer(() => { /* never answers */ });
    await new Promise<void>((r) => silent.listen(0, '127.0.0.1', r));
    const slow = (await subscribe(acc, { url: `http://127.0.0.1:${(silent.address() as AddressInfo).port}/x`, events: ['*'] })).body.data.id;

    process.env.WEBHOOK_TIMEOUT_MS = '300';
    try {
      await queueWebhookDeliveries(await emit(acc, 'malapos.purchase_order.received.v1'));
      await deliverDueWebhooks();
    } finally {
      delete process.env.WEBHOOK_TIMEOUT_MS;
      silent.closeAllConnections();
      await new Promise((r) => silent.close(r));
    }
    const of = async (subscriptionId: string) => prisma.webhookDelivery.findFirstOrThrow({ where: { subscriptionId } });
    expect(await of(redirect)).toMatchObject({ status: 'pending', responseCode: 302, lastError: 'redirect not followed (HTTP 302)' });
    expect((await of(refused)).lastError).toMatch(/ECONNREFUSED/);
    expect(await of(slow)).toMatchObject({ responseCode: null, lastError: 'timed out after 300ms' });
    // The redirect target (cloud metadata) was never requested.
    expect(received.every((r) => r.path === '/hook/redirect')).toBe(true);
  });

  it('switches off a subscription that keeps failing, tells the account, and re-enabling clears the streak', async () => {
    process.env.WEBHOOK_DISABLE_AFTER_FAILURES = '3';
    process.env.WEBHOOK_DISABLE_AFTER_HOURS = '1';
    const acc = account('breaker');
    const subscriptionId = (await subscribe(acc, { url: `${base}/hook/down`, events: ['*'] })).body.data.id;
    const watcherId = (await subscribe(acc, { url: `${base}/hook/watch`, events: ['malapos.webhook_subscription.*'] })).body.data.id;
    answers.set('/hook/down', 500);
    for (let i = 0; i < 3; i++) await queueWebhookDeliveries(await emit(acc, 'malapos.kds.served.v1', { i }));

    const t0 = new Date();
    expect(await deliverDueWebhooks({ now: t0 })).toBe(3);
    let s = await prisma.webhookSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    // Three failures in a row, but the streak is minutes old: a deploy blip, not dead.
    expect(s).toMatchObject({ active: true, consecutiveFailures: 3, disabledAt: null });
    expect(s.failingSince).not.toBeNull();

    // Two hours on, still failing: the next failure switches it off.
    expect(await deliverDueWebhooks({ now: new Date(t0.getTime() + 2 * 3600_000), limit: 1 })).toBe(1);
    s = await prisma.webhookSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(s.active).toBe(false);
    expect(s.disabledAt).not.toBeNull();
    expect(s.disabledReason).toMatch(/^4 consecutive failed deliveries since /);
    const rows = await prisma.webhookDelivery.findMany({ where: { subscriptionId } });
    expect(rows.every((r) => r.status === 'failed' && r.nextRetryAt === null)).toBe(true);
    expect(rows.filter((r) => r.lastError?.startsWith('endpoint disabled: '))).toHaveLength(2);

    // The account hears about it: one malapos.webhook_subscription.disabled.v1, which
    // reaches the watcher (the switched-off subscription gets nothing more).
    const disabled = await prisma.outboxEvent.findMany({ where: { accountId: acc, type: 'malapos.webhook_subscription.disabled.v1' } });
    expect(disabled).toHaveLength(1);
    expect(disabled[0]!.data).toMatchObject({
      id: subscriptionId, url: `${base}/hook/down`, consecutiveFailures: 4,
      disabledReason: s.disabledReason, disabledAt: s.disabledAt!.toISOString(), failingSince: s.failingSince!.toISOString(),
    });
    expect(await queueWebhookDeliveries(disabled[0]!)).toBe(1);
    expect(await prisma.webhookDelivery.count({ where: { eventId: disabled[0]!.id, subscriptionId: watcherId } })).toBe(1);
    expect(await prisma.webhookDelivery.count({ where: { eventId: disabled[0]!.id, subscriptionId } })).toBe(0);
    expect(await deliverDueWebhooks({ now: new Date(t0.getTime() + 2 * 3600_000 + 1000) })).toBe(1);
    expect(JSON.parse(hits('/hook/watch')[0]!.body)).toMatchObject({ type: 'malapos.webhook_subscription.disabled.v1', data: { id: subscriptionId } });

    // Pausing by hand is not a switch-off: no event.
    await request(app()).patch(`/api/v1/webhook-subscriptions/${watcherId}`).set('x-test-account', acc).send({ active: false }).expect(200);
    expect(await prisma.outboxEvent.count({ where: { accountId: acc, type: 'malapos.webhook_subscription.disabled.v1' } })).toBe(1);

    // Nothing more is queued for it while it is off; a retry is refused.
    await queueWebhookDeliveries(await emit(acc, 'malapos.kds.served.v1'));
    expect(await prisma.webhookDelivery.count({ where: { subscriptionId } })).toBe(3);
    const refused = await request(app()).post(`/api/v1/webhook-subscriptions/deliveries/${rows[0]!.id}/retry`).set('x-test-account', acc);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('ENDPOINT_DISABLED');

    const listed = await request(app()).get('/api/v1/webhook-subscriptions').set('x-test-account', acc);
    const down = listed.body.data.subscriptions.find((x: { id: string }) => x.id === subscriptionId);
    expect(down).toMatchObject({ active: false, consecutiveFailures: 4 });
    expect(down.disabledReason).toMatch(/consecutive failed deliveries/);
    expect(down.secret).toBeUndefined();

    const on = await request(app()).patch(`/api/v1/webhook-subscriptions/${subscriptionId}`).set('x-test-account', acc).send({ active: true });
    expect(on.body.data).toMatchObject({ active: true, consecutiveFailures: 0, failingSince: null, disabledAt: null, disabledReason: null });
  });

  it('refuses private, loopback and link-local targets, and http in production', async () => {
    delete process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
    const acc = account('ssrf');
    __setWebhookResolver(async (host) => {
      const table: Record<string, string> = {
        'hooks.example.com': '93.184.216.34',
        'rebind.example.com': '10.1.2.3',
        'metadata.example.com': '169.254.169.254',
        'v6.example.com': 'fd00::1',
      };
      if (!table[host]) throw new Error('ENOTFOUND');
      return [{ address: table[host]!, family: table[host]!.includes(':') ? 6 : 4 }];
    });

    for (const url of [
      `${base}/hook/x`,
      'http://localhost:4191/api/v1/admin',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]:6379/',
      'http://10.0.0.5/',
      'http://100.100.1.1/', // the tailnet
      'http://[::ffff:127.0.0.1]/',
      'https://rebind.example.com/hook',
      'https://metadata.example.com/hook',
      'https://v6.example.com/hook',
      'https://nowhere.example.com/hook',
      'https://db.internal/hook',
    ]) {
      const res = await subscribe(acc, { url, events: ['*'] });
      expect(res.status, url).toBe(400);
      expect(res.body.error.code, url).toBe('VALIDATION_ERROR');
    }
    const okRes = await subscribe(acc, { url: 'https://hooks.example.com/hook', events: ['*'] });
    expect(okRes.status).toBe(201);
    // …and a URL change goes through the same check.
    await request(app()).patch(`/api/v1/webhook-subscriptions/${okRes.body.data.id}`).set('x-test-account', acc)
      .send({ url: 'http://127.0.0.1:9/' }).expect(400);
    expect(await prisma.webhookSubscription.count({ where: { accountId: acc } })).toBe(1);

    // A target that turns private after registration is refused at delivery time too.
    __setWebhookResolver(async () => [{ address: '10.9.9.9', family: 4 }]);
    await queueWebhookDeliveries(await emit(acc, 'malapos.sale.completed.v1'));
    await deliverDueWebhooks();
    const row = await prisma.webhookDelivery.findFirstOrThrow({ where: { subscriptionId: okRes.body.data.id } });
    expect(row.lastError).toMatch(/^blocked: /);
    expect(row.responseCode).toBeNull();

    const prevEnv = process.env.NODE_ENV;
    try {
      // Production — and any NODE_ENV that is not development/test, unset included.
      for (const env of ['production', 'staging', undefined]) {
        if (env === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = env;
        __setWebhookResolver(async () => [{ address: '93.184.216.34', family: 4 }]);
        const plain = await subscribe(acc, { url: 'http://hooks.example.com/hook', events: ['*'] });
        expect(plain.status, String(env)).toBe(400);
        expect(plain.body.error.message).toMatch(/https/);
        // The dev escape hatch does nothing there.
        process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'true';
        expect((await subscribe(acc, { url: `${base}/hook/x`, events: ['*'] })).status, String(env)).toBe(400);
        delete process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
      }
    } finally {
      process.env.NODE_ENV = prevEnv;
      delete process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
    }
  });

  it('prunes finished deliveries past retention, never pending ones', async () => {
    const acc = account('prune');
    const subscriptionId = (await subscribe(acc, { url: `${base}/hook/prune`, events: ['*'] })).body.data.id;
    for (let i = 0; i < 3; i++) await queueWebhookDeliveries(await emit(acc, 'malapos.kds.reverted.v1', { i }));
    const [a, b] = await prisma.webhookDelivery.findMany({ where: { subscriptionId }, orderBy: { createdAt: 'asc' } });
    const old = new Date(Date.now() - 40 * 24 * 3600_000);
    await prisma.webhookDelivery.update({ where: { id: a!.id }, data: { status: 'succeeded', createdAt: old } });
    await prisma.webhookDelivery.update({ where: { id: b!.id }, data: { createdAt: old } }); // still pending
    expect(await pruneOldDeliveries()).toBeGreaterThanOrEqual(1);
    const left = await prisma.webhookDelivery.findMany({ where: { subscriptionId } });
    expect(left.map((r) => r.id).sort()).toEqual(left.filter((r) => r.id !== a!.id).map((r) => r.id).sort());
    expect(left).toHaveLength(2);
  });

  it('serves the event catalogue, and every type the code emits is in it', async () => {
    const acc = account('catalog');
    const res = await request(app()).get('/api/v1/webhook-subscriptions/event-types').set('x-test-account', acc);
    expect(res.status).toBe(200);
    expect(res.body.data.types.map((t: { type: string }) => t.type)).toEqual(EVENT_TYPES.map((t) => t.type));

    const src = path.resolve(__dirname, '..');
    const emitted = new Set<string>();
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); continue; }
        if (!p.endsWith('.ts')) continue;
        for (const m of fs.readFileSync(p, 'utf8').matchAll(/['"`](malapos\.[a-z_]+(?:\.[a-z_]+)*\.v\d+)['"`]/g)) emitted.add(m[1]!);
      }
    };
    walk(src);
    const known = new Set(EVENT_TYPES.map((t) => t.type as string));
    expect([...emitted].filter((t) => !known.has(t))).toEqual([]);
    expect(emitted.size).toBeGreaterThanOrEqual(12);
  });

  it('production starts the outbox and the delivery worker (index.ts)', () => {
    const index = fs.readFileSync(path.resolve(__dirname, '../index.ts'), 'utf8');
    expect(index).toMatch(/startOutboxWorker\(\)/);
    expect(index).toMatch(/startWebhookDeliveryWorker\(\)/);
    expect(index).not.toMatch(/node dist\/services\/outbox-worker\.js/);
  });
});
