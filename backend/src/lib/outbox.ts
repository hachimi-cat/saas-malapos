import type { Prisma } from '@prisma/client';
import { newId } from './ids.js';

// Transactional outbox writer — ADR-0006. Call INSIDE the same
// prisma.$transaction as the state change it announces. A polling worker
// fans unpublished rows out to Huudis webhook subscriptions.

export async function writeOutbox(
  tx: Prisma.TransactionClient,
  opts: {
    type: string; // "malapos.<aggregate>.<verb>.v1"
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
