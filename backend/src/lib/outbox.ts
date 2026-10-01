import type { Prisma } from '@prisma/client';
import { newId } from './ids.js';
import type { EventType } from './event-types.js';

// Transactional outbox writer — ADR-0006. Call INSIDE the same
// prisma.$transaction as the state change it announces. The outbox worker
// (services/outbox-worker.ts) fans unpublished rows out to the merchant's
// webhook subscriptions. `type` must be in the event catalogue
// (lib/event-types.ts) — the types the dashboard and the docs offer.

export async function writeOutbox(
  tx: Prisma.TransactionClient,
  opts: {
    type: EventType; // "malapos.<aggregate>.<verb>.v1"
    accountId: string;
    aggregateId: string;
    data: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      id: newId('evt'),
      type: opts.type,
      accountId: opts.accountId,
      aggregateId: opts.aggregateId,
      occurredAt: new Date(),
      data: opts.data,
    },
  });
}
