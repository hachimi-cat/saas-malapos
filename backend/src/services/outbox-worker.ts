import { prisma } from '../lib/db.js';

/**
 * Outbox polling worker — ADR-0006.
 *
 * Reads unpublished `outbox_events` and fans them out to subscribed
 * services. Subscribers register their webhook URLs in huudis (not
 * implemented in this template — wire up once Huudis M2 ships the
 * subscription CRUD).
 *
 * Template ships the loop skeleton so every product exports the same
 * `startOutboxWorker()` symbol, even if the actual fan-out is a no-op
 * until subscribers are configured.
 */

const POLL_MS = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000);
const BATCH = Number(process.env.OUTBOX_BATCH_SIZE ?? 100);

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

async function deliver(ev: { id: string; type: string }) {
  // TODO: resolve subscribers for ev.type via Huudis subscription CRUD and
  // POST the envelope. Until then, mark as published so events don't
  // accumulate during dev. Each product overrides this during its M* work.
  await prisma.outboxEvent.update({
    where: { id: ev.id },
    data: { publishedAt: new Date() },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
