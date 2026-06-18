import { prisma } from './db.js';

/**
 * Cash reconciliation for a cashier shift.
 *
 * A shift's expected drawer cash at close is:
 *   openingFloat
 *     + Σ CASH payments (status PAID) on COMPLETED transactions in the shift
 *     − cash paid back (cash-out payouts / refunds)
 *
 * v1 has no cash-out payouts, so the subtracted term is always 0. The
 * helper still computes it explicitly so the formula reads honestly and
 * the term can be wired in later without restructuring callers.
 */
export interface ShiftCashTotals {
  /** Σ CASH payments PAID on COMPLETED transactions in the shift. */
  cashSales: number;
  /** Cash handed back out of the drawer (refunds/payouts). 0 in v1. */
  cashOut: number;
  /** openingFloat + cashSales − cashOut. */
  expectedCash: number;
}

/**
 * Compute the cash totals for a shift from its COMPLETED transactions'
 * PAID cash payments. `openingFloat` is the shift's starting drawer cash.
 */
export async function closeShiftReconciliation(
  accountId: string,
  shiftId: string,
  openingFloat: number,
): Promise<ShiftCashTotals> {
  const agg = await prisma.payment.aggregate({
    where: {
      accountId,
      method: 'CASH',
      status: 'PAID',
      transaction: { shiftId, status: 'COMPLETED' },
    },
    _sum: { amount: true },
  });

  const cashSales = agg._sum.amount ?? 0;
  const cashOut = 0; // no cash-out payouts in v1
  const expectedCash = openingFloat + cashSales - cashOut;

  return { cashSales, cashOut, expectedCash };
}
