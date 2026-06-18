import { prisma } from '../lib/db.js';
import { buildWebhookSignature, SIGNATURE_HEADER } from '../lib/webhook-signature.js';

/**
 * Outbox polling worker — ADR-0006.
 *
 * Reads unpublished `outbox_events` and fans them out:
 *  - to the customer's own webhook endpoints (WebhookSubscription rows
 *    for the event's accountId, filtered on the events allowlist) —
 *    shipped below; deliveries carry `Malapos-Signature: t=…,v1=…`
 *    over the malapos.* events;
 *  - to subscribed Forjio services via Huudis subscription CRUD — not
 *    implemented yet (wire up once Huudis M2 ships it).
 *
 * Publishing semantics are unchanged from the template: each row is
 * marked published exactly once, in createdAt order. Customer webhook
 * delivery is fire-and-forget on top of that — see deliver().
 */

const POLL_MS = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000);
const BATCH = Number(process.env.OUTBOX_BATCH_SIZE ?? 100);
const WEBHOOK_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS ?? 5000);

let stopped = false;

export async function startOutboxWorker() {
  console.log(`[outbox] polling every ${POLL_MS}ms, batch=${BATCH}`);
  while (!stopped) {
    try {
      const batch = await prisma.outboxEvent.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: 'asc' },
        take: BATCH,
      });
      for (const ev of batch) {
        await deliver(ev);
      }
    } catch (e) {
      console.error('[outbox] loop error', e);
    }
    await sleep(POLL_MS);
  }
}

export function stopOutboxWorker() {
  stopped = true;
}

/** Does this subscription's allowlist match the event type?
 *  `["*"]` (the default) matches everything. */
export function subscriptionMatchesType(events: unknown, type: string): boolean {
  if (!Array.isArray(events)) return false;
  return events.some((e) => e === '*' || e === type);
}

async function deliver(ev: {
  id: string;
  type: string;
  accountId: string | null;
  occurredAt: Date;
  data: unknown;
}) {
  // Customer webhook fan-out. Fire-and-forget: the row is marked
  // published regardless of delivery outcome, and per-endpoint
  // failures are logged but NOT retried in v1 — honest limitation;
  // a retry/dead-letter queue is a later milestone. Receivers that
  // need certainty should reconcile via the REST API.
  if (ev.accountId) {
    try {
      const subs = await prisma.webhookSubscription.findMany({
        where: { accountId: ev.accountId, active: true },
      });
      const envelope = JSON.stringify({
        id: ev.id,
        type: ev.type,
        occurredAt: ev.occurredAt.toISOString(),
        data: ev.data,
      });
      for (const sub of subs) {
        if (!subscriptionMatchesType(sub.events, ev.type)) continue;
        void postWebhook(sub, envelope, ev.id);
      }
    } catch (e) {
      console.error('[outbox] webhook fan-out failed', ev.id, e);
    }
  }

  // TODO: cross-service fan-out via Huudis subscription CRUD (Huudis
  // M2). Until then this only marks the row published so events don't
  // accumulate during dev.
  await prisma.outboxEvent.update({
    where: { id: ev.id },
    data: { publishedAt: new Date() },
  });
}

async function postWebhook(
  sub: { id: string; url: string; secret: string },
  body: string,
  eventId: string,
): Promise<void> {
  try {
    const res = await fetch(sub.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SIGNATURE_HEADER]: buildWebhookSignature(sub.secret, body),
      },
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[outbox] webhook ${sub.id} for ${eventId} → HTTP ${res.status}`);
    }
  } catch (e) {
    console.error(`[outbox] webhook ${sub.id} for ${eventId} failed`, e);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
