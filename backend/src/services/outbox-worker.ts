import { prisma } from '../lib/db.js';
import { eventMatches } from '../lib/event-types.js';
import { queueWebhookDeliveries } from './webhook-delivery.js';

/**
 * Outbox polling worker — ADR-0006.
 *
 * Reads unpublished `outbox_events` in createdAt order and fans each one out
 * to the customer's own webhook endpoints: one `WebhookDelivery` row per
 * matching active WebhookSubscription of the event's account
 * (services/webhook-delivery.ts `queueWebhookDeliveries`), which the delivery
 * worker then sends, signs (`Malapos-Signature: t=…,v1=…`), retries and
 * records. A row is marked published only once its deliveries are queued; a
 * fan-out that fails (the database was briefly unreachable) is counted in
 * `attempts` / `lastError` and tried again on the next poll — queueing is
 * idempotent per (subscription, event), so a retry never queues twice.
 *
 * The audit log (routes/audit-log.ts) reads the same table.
 */

const POLL_MS = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000);
const BATCH = Number(process.env.OUTBOX_BATCH_SIZE ?? 100);

let stopped = false;

export async function startOutboxWorker() {
  console.log(`[outbox] polling every ${POLL_MS}ms, batch=${BATCH}`);
  while (!stopped) {
    try {
      await processOutboxBatch();
    } catch (e) {
      console.error('[outbox] loop error', e);
    }
    await sleep(POLL_MS);
  }
}

export function stopOutboxWorker() {
  stopped = true;
}

/** One poll: fan out every unpublished event (oldest first). Returns how many
 *  were published. Exported for tests. */
export async function processOutboxBatch(limit = BATCH): Promise<number> {
  const batch = await prisma.outboxEvent.findMany({
    where: { publishedAt: null },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  let published = 0;
  for (const ev of batch) {
    try {
      await queueWebhookDeliveries(ev);
      await prisma.outboxEvent.update({ where: { id: ev.id }, data: { publishedAt: new Date() } });
      published++;
    } catch (e) {
      console.error('[outbox] webhook fan-out failed', ev.id, e);
      await prisma.outboxEvent
        .update({
          where: { id: ev.id },
          data: { attempts: { increment: 1 }, lastError: String((e as Error)?.message ?? e).slice(0, 500) },
        })
        .catch(() => undefined);
    }
  }
  return published;
}

/** Does this subscription's allowlist match the event type? `["*"]` (the
 *  default) matches everything; `malapos.kds.*` every kds event. */
export function subscriptionMatchesType(events: unknown, type: string): boolean {
  return eventMatches(events, type);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
