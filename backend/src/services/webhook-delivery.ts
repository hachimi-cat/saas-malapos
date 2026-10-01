/**
 * Merchant webhooks — delivering outbox events to the endpoints a merchant
 * subscribed (POST /api/v1/webhook-subscriptions), with the Forjio family's
 * retry schedule (Fulkruma's and Plugipay's services/webhook-delivery.ts).
 *
 * Two steps, both run by the API process (index.ts starts them):
 *
 *  1. fan-out (`queueWebhookDeliveries`, called by services/outbox-worker.ts
 *     for every outbox event): one `WebhookDelivery` row — status `pending`,
 *     due now — for each ACTIVE subscription of the event's own account whose
 *     `events` match its type and that already existed when the event
 *     happened. Account-scoped: an event with no accountId goes to nobody, and
 *     one account's events never reach another's endpoints. Idempotent on
 *     (subscriptionId, eventId), so running it twice never queues an event
 *     twice. The body is built once and stored: every attempt sends the same
 *     bytes.
 *
 *  2. delivery (`deliverDueWebhooks`, polled by `startWebhookDeliveryWorker`):
 *     every pending row whose `nextRetryAt` has come is CLAIMED (a conditional
 *     update pushes `nextRetryAt` out by a lease, so two pollers never send the
 *     same row and a crash mid-request just lets the lease run out), POSTed
 *     signed with the subscription's secret, and the outcome written: one
 *     `WebhookDeliveryAttempt` per attempt, and the row moved to `succeeded`,
 *     rescheduled, or — after the last attempt — `failed`.
 *
 * The request (the family convention; README/api-reference.md document it):
 *
 *   POST <subscription url>
 *   Content-Type: application/json
 *   Malapos-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 *   Malapos-Event-Id / Malapos-Event-Type / Malapos-Delivery-Id / Malapos-Delivery-Attempt
 *   body: { id, type, occurredAt, accountId, data }   (id = evt_…, the same on every attempt)
 *
 * A 2xx within 10 s is success; anything else — another status, a redirect
 * (never followed), a timeout, a refused connection, a target the SSRF guard
 * (lib/webhook-target.ts) blocks — is a failed attempt, retried 1 min, 5 min,
 * 25 min, 2 h and 12 h later; when the 6th attempt fails the row is `failed`
 * and stays so until someone retries it (POST
 * /webhook-subscriptions/deliveries/:id/retry).
 *
 * A subscription that keeps failing is switched off (`active: false`,
 * `disabledAt`, `disabledReason`): 20 failed attempts in a row AND a failure
 * streak at least 24 h old, so a short outage during a merchant's deploy never
 * switches anyone off — the retries ride that out. Its queued deliveries
 * become `failed`, and `malapos.webhook_subscription.disabled.v1` goes to the
 * account's other subscriptions; re-enabling it (PATCH active: true) resets
 * the streak.
 */
import http from 'node:http';
import https from 'node:https';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { writeOutbox } from '../lib/outbox.js';
import { eventMatches } from '../lib/event-types.js';
import { buildWebhookSignature, SIGNATURE_HEADER } from '../lib/webhook-signature.js';
import { assertSafeWebhookUrl, guardedLookup } from '../lib/webhook-target.js';

/** Delay before retry N (index 0 = after the 1st attempt fails). */
export const RETRY_DELAYS_MS: readonly number[] = [
  60 * 1000,
  5 * 60 * 1000,
  25 * 60 * 1000,
  2 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
];
/** The 1st attempt plus one per scheduled retry. */
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

function timeoutMs(): number {
  return Math.max(1, Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000));
}
function disableAfterFailures(): number {
  return Math.max(1, Number(process.env.WEBHOOK_DISABLE_AFTER_FAILURES ?? 20));
}
function disableAfterMs(): number {
  return Math.max(0, Number(process.env.WEBHOOK_DISABLE_AFTER_HOURS ?? 24)) * 60 * 60 * 1000;
}
function concurrency(): number {
  return Math.max(1, Number(process.env.WEBHOOK_DELIVERY_CONCURRENCY ?? 5));
}
function batchSize(): number {
  return Math.max(1, Number(process.env.WEBHOOK_DELIVERY_BATCH ?? 50));
}
/** A claimed row becomes due again this long after its request's timeout. */
const LEASE_GRACE_MS = 60_000;

// ── fan-out ─────────────────────────────────────────────────────────

export interface OutboxEventLike {
  id: string;
  type: string;
  accountId: string | null;
  occurredAt: Date;
  data: unknown;
}

/** The webhook body: the same bytes on every attempt. */
export function webhookBody(ev: OutboxEventLike): string {
  return JSON.stringify({
    id: ev.id,
    type: ev.type,
    occurredAt: ev.occurredAt.toISOString(),
    accountId: ev.accountId,
    data: ev.data ?? null,
  });
}

/** Queue `ev` for every matching subscription of its account. Returns how
 *  many deliveries were newly queued. */
export async function queueWebhookDeliveries(ev: OutboxEventLike, now = new Date()): Promise<number> {
  if (!ev.accountId) return 0;
  const subs = await prisma.webhookSubscription.findMany({
    where: { accountId: ev.accountId, active: true, createdAt: { lte: ev.occurredAt } },
    select: { id: true, events: true },
  });
  const matching = subs.filter((s) => eventMatches(s.events, ev.type));
  if (matching.length === 0) return 0;
  const body = webhookBody(ev);
  const created = await prisma.webhookDelivery.createMany({
    data: matching.map((s) => ({
      id: newId('whd'),
      accountId: ev.accountId!,
      subscriptionId: s.id,
      eventId: ev.id,
      type: ev.type,
      body,
      status: 'pending' as const,
      nextRetryAt: now,
    })),
    skipDuplicates: true,
  });
  return created.count;
}

// ── HTTP ────────────────────────────────────────────────────────────

export interface AttemptResult {
  ok: boolean;
  status: number | null;
  error: string | null;
  durationMs: number;
}

/** POST without following redirects, through the guarded DNS lookup, with a
 *  hard deadline. The answer's body is drained, not kept. */
function postJson(url: string, headers: Record<string, string>, body: string, deadlineMs: number): Promise<AttemptResult> {
  const started = performance.now();
  const target = new URL(url);
  const mod = target.protocol === 'https:' ? https : http;
  return new Promise((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (r: Omit<AttemptResult, 'durationMs'>) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ ...r, durationMs: Math.round(performance.now() - started) });
    };
    const req = mod.request(
      target,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
        lookup: guardedLookup as never,
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        res.resume();
        res.on('end', () => {
          const ok = status >= 200 && status < 300;
          const error = ok
            ? null
            : status >= 300 && status < 400
              ? `redirect not followed (HTTP ${status})`
              : `HTTP ${status}`;
          finish({ ok, status, error });
        });
        res.on('error', (e) => finish({ ok: false, status, error: e.message }));
      },
    );
    timer = setTimeout(() => {
      finish({ ok: false, status: null, error: `timed out after ${deadlineMs}ms` });
      req.destroy();
    }, deadlineMs);
    req.on('error', (e) => finish({ ok: false, status: null, error: e.message || String(e) }));
    req.end(body);
  });
}

/** One signed attempt at `url`. The SSRF guard runs first; a blocked target
 *  is a failed attempt, never a request. */
export async function sendSignedWebhook(
  url: string,
  secret: string,
  body: string,
  meta: { eventId: string; type: string; deliveryId: string; attempt: number },
): Promise<AttemptResult> {
  try {
    await assertSafeWebhookUrl(url);
  } catch (e) {
    return { ok: false, status: null, error: (e as Error).message, durationMs: 0 };
  }
  return postJson(
    url,
    {
      'Content-Type': 'application/json',
      'User-Agent': 'Malapos-Webhooks/1.0',
      [SIGNATURE_HEADER]: buildWebhookSignature(secret, body),
      'Malapos-Event-Id': meta.eventId,
      'Malapos-Event-Type': meta.type,
      'Malapos-Delivery-Id': meta.deliveryId,
      'Malapos-Delivery-Attempt': String(meta.attempt),
    },
    body,
    timeoutMs(),
  );
}

// ── delivery ────────────────────────────────────────────────────────

/** Mark a subscription's queued deliveries `failed` (it was switched off). */
export async function failPendingDeliveries(
  client: Prisma.TransactionClient | typeof prisma,
  subscriptionId: string,
  reason: string,
): Promise<number> {
  const r = await client.webhookDelivery.updateMany({
    where: { subscriptionId, status: 'pending' },
    data: { status: 'failed', nextRetryAt: null, lastError: reason },
  });
  return r.count;
}

/** Claim and attempt one due delivery. Returns false when another poller had
 *  already claimed it (or it is no longer due, or its subscription is gone). */
async function deliverOne(id: string, clock: () => Date): Promise<boolean> {
  const claimedAt = clock();
  const claim = await prisma.webhookDelivery.updateMany({
    where: { id, status: 'pending', nextRetryAt: { lte: claimedAt } },
    data: { nextRetryAt: new Date(claimedAt.getTime() + timeoutMs() + LEASE_GRACE_MS) },
  });
  if (claim.count !== 1) return false;

  const row = await prisma.webhookDelivery.findUnique({ where: { id }, include: { subscription: true } });
  if (!row) return false; // the subscription was deleted meanwhile (cascade)
  const sub = row.subscription;
  if (!sub.active) {
    await prisma.webhookDelivery.update({
      where: { id },
      data: { status: 'failed', nextRetryAt: null, lastError: 'endpoint is disabled' },
    });
    return true;
  }

  const attemptNumber = row.attempts + 1;
  const result = await sendSignedWebhook(sub.url, sub.secret, row.body, {
    eventId: row.eventId,
    type: row.type,
    deliveryId: row.id,
    attempt: attemptNumber,
  });
  const at = clock();

  if (result.ok) {
    await prisma.$transaction([
      prisma.webhookDeliveryAttempt.create({
        data: {
          id: newId('wda'), deliveryId: row.id, accountId: row.accountId, subscriptionId: sub.id, attemptNumber,
          status: 'succeeded', responseCode: result.status, durationMs: result.durationMs, attemptedAt: at,
        },
      }),
      prisma.webhookDelivery.update({
        where: { id: row.id },
        data: {
          status: 'succeeded', attempts: attemptNumber, lastAttemptAt: at, nextRetryAt: null, deliveredAt: at,
          responseCode: result.status, lastError: null,
        },
      }),
      prisma.webhookSubscription.updateMany({
        where: { id: sub.id, OR: [{ consecutiveFailures: { gt: 0 } }, { failingSince: { not: null } }] },
        data: { consecutiveFailures: 0, failingSince: null },
      }),
    ]);
    return true;
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const s = await tx.webhookSubscription.update({
      where: { id: sub.id },
      data: { consecutiveFailures: { increment: 1 } },
    });
    const failingSince = s.failingSince ?? at;
    if (!s.failingSince) {
      await tx.webhookSubscription.updateMany({ where: { id: s.id, failingSince: null }, data: { failingSince: at } });
    }
    let disabledReason: string | null = null;
    if (
      s.active
      && s.consecutiveFailures >= disableAfterFailures()
      && at.getTime() - failingSince.getTime() >= disableAfterMs()
    ) {
      const reason = `${s.consecutiveFailures} consecutive failed deliveries since ${failingSince.toISOString()}`;
      const off = await tx.webhookSubscription.updateMany({
        where: { id: s.id, active: true },
        data: { active: false, disabledAt: at, disabledReason: reason },
      });
      if (off.count === 1) disabledReason = reason;
    }

    const giveUp = attemptNumber >= MAX_ATTEMPTS || disabledReason !== null;
    const nextRetryAt = giveUp ? null : new Date(at.getTime() + RETRY_DELAYS_MS[attemptNumber - 1]!);
    await tx.webhookDeliveryAttempt.create({
      data: {
        id: newId('wda'), deliveryId: row.id, accountId: row.accountId, subscriptionId: sub.id, attemptNumber,
        status: 'failed', responseCode: result.status, durationMs: result.durationMs, error: result.error,
        nextRetryAt, attemptedAt: at,
      },
    });
    await tx.webhookDelivery.update({
      where: { id: row.id },
      data: {
        status: giveUp ? 'failed' : 'pending', attempts: attemptNumber, lastAttemptAt: at, nextRetryAt,
        responseCode: result.status, lastError: result.error,
      },
    });
    if (disabledReason) {
      await failPendingDeliveries(tx, sub.id, `endpoint disabled: ${disabledReason}`);
      // Tell the account: its other subscriptions to this type get it (this one
      // is off by the time the outbox worker fans the event out).
      await writeOutbox(tx, {
        type: 'malapos.webhook_subscription.disabled.v1',
        accountId: sub.accountId,
        aggregateId: sub.id,
        data: {
          id: sub.id,
          url: sub.url,
          disabledAt: at.toISOString(),
          disabledReason,
          consecutiveFailures: s.consecutiveFailures,
          failingSince: failingSince.toISOString(),
        },
      });
    }
    return { disabledReason };
  });

  if (outcome.disabledReason) {
    console.warn(`[webhooks] subscription ${sub.id} (account ${sub.accountId}) disabled: ${outcome.disabledReason}`);
  }
  return true;
}

async function forEachLimited<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item);
    }
  });
  await Promise.all(lanes);
}

/**
 * Attempt every delivery that is due. `now` overrides the clock (tests step
 * through the retry schedule with it). Returns how many were attempted (or
 * failed for a disabled subscription) by this call.
 */
export async function deliverDueWebhooks(opts: { now?: Date; limit?: number } = {}): Promise<number> {
  const clock = () => opts.now ?? new Date();
  const due = await prisma.webhookDelivery.findMany({
    where: { status: 'pending', nextRetryAt: { lte: clock() } },
    orderBy: { nextRetryAt: 'asc' },
    take: opts.limit ?? batchSize(),
    select: { id: true },
  });
  let handled = 0;
  await forEachLimited(due, concurrency(), async ({ id }) => {
    try {
      if (await deliverOne(id, clock)) handled++;
    } catch (e) {
      console.error(`[webhooks] delivery ${id} errored`, e);
    }
  });
  return handled;
}

// ── manual retry ────────────────────────────────────────────────────

export type RetryOutcome =
  | { ok: true; id: string }
  | { ok: false; code: 'NOT_FOUND' | 'ALREADY_QUEUED' | 'ENDPOINT_DISABLED'; message: string };

/** Queue one more attempt now — for a `failed` delivery, or to send a
 *  `succeeded` one again. If it fails, the scheduled retries left (out of
 *  MAX_ATTEMPTS) follow as usual. */
export async function retryWebhookDelivery(accountId: string, id: string): Promise<RetryOutcome> {
  const row = await prisma.webhookDelivery.findFirst({
    where: { id, accountId },
    include: { subscription: { select: { active: true } } },
  });
  if (!row) return { ok: false, code: 'NOT_FOUND', message: 'webhook delivery not found' };
  if (row.status === 'pending') {
    return { ok: false, code: 'ALREADY_QUEUED', message: 'this delivery is already queued' };
  }
  if (!row.subscription.active) {
    return { ok: false, code: 'ENDPOINT_DISABLED', message: 'the endpoint is disabled; re-enable it first' };
  }
  await prisma.webhookDelivery.update({
    where: { id: row.id },
    data: { status: 'pending', nextRetryAt: new Date() },
  });
  return { ok: true, id: row.id };
}

// ── retention ───────────────────────────────────────────────────────

/** How long a finished delivery (succeeded or failed) and its attempts are
 *  kept. Pending ones are never pruned. */
export function retentionDays(): number {
  return Math.max(1, Number(process.env.WEBHOOK_RETENTION_DAYS ?? 30));
}

export async function pruneOldDeliveries(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - retentionDays() * 24 * 60 * 60 * 1000);
  const { count } = await prisma.webhookDelivery.deleteMany({
    where: { status: { in: ['succeeded', 'failed'] }, createdAt: { lt: before } },
  });
  return count;
}

// ── the poller ──────────────────────────────────────────────────────

const POLL_MS = Number(process.env.WEBHOOK_POLL_INTERVAL_MS ?? 1000);
const PRUNE_EVERY_MS = 60 * 60 * 1000;
let stopped = false;

export async function startWebhookDeliveryWorker(): Promise<void> {
  console.log(`[webhooks] delivery worker polling every ${POLL_MS}ms`);
  let lastPrune = 0;
  while (!stopped) {
    try {
      await deliverDueWebhooks();
      if (Date.now() - lastPrune >= PRUNE_EVERY_MS) {
        lastPrune = Date.now();
        const pruned = await pruneOldDeliveries();
        if (pruned) console.log(`[webhooks] pruned ${pruned} deliveries older than ${retentionDays()} days`);
      }
    } catch (e) {
      console.error('[webhooks] delivery loop error', e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export function stopWebhookDeliveryWorker(): void {
  stopped = true;
}
