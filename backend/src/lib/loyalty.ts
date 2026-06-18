import { prisma } from './db.js';
import { newId } from './ids.js';
import { ApiError } from './http.js';

/**
 * Manual loyalty point movements (adjust / redeem). Sale-time EARN is
 * handled in lib/sell.ts and is NOT duplicated here.
 *
 * `applyLoyalty` is the shared write path: it validates the resulting
 * balance, appends a signed LoyaltyEntry, and updates the customer's
 * denormalized `loyaltyPoints` — all in one transaction. `points` is
 * signed (+ grants, − deducts). The balance may never go negative.
 */
export async function applyLoyalty(
  accountId: string,
  customerId: string,
  points: number,
  reason: string,
) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, accountId } });
  if (!customer) throw new ApiError(404, 'NOT_FOUND', 'Customer not found');

  if (customer.loyaltyPoints + points < 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Insufficient points');
  }

  const [entry, updated] = await prisma.$transaction([
    prisma.loyaltyEntry.create({
      data: { id: newId('loy'), accountId, customerId, points, reason },
    }),
    prisma.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: { increment: points } },
    }),
  ]);

  return { customer: updated, entry };
}
