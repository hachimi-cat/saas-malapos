import { Router } from 'express';
import { TransactionStatus } from '@prisma/client';
import { sendOk, sendErr } from '../lib/http.js';
import { prisma } from '../lib/db.js';

/*
 * GET /api/v1/admin/transactions — the admin-portal standard's
 * Transactions contract (`AdminTransactionList` in @forjio/admin-ui).
 *
 * THIS PAGE IS THE ITEMISATION OF THE BUSINESS-METRICS TILE. Same table,
 * same filter, same window as the `transactions` slice of
 * admin-metrics.ts. If the two ever disagree an operator has no way to
 * tell which one is lying, so they are written to the same definition.
 *
 * WHOSE MONEY IS THIS? Malapos is a point-of-sale product, so these are
 * the SHOPS' sales to their shoppers — the volume the platform rings up —
 * not malapos's own subscription revenue.
 *
 * NET, NOT GROSS. A refunded sale keeps its row (dropping it would lose
 * the history) but its `refundedTotal` is subtracted, so a fully refunded
 * sale contributes zero rather than continuing to count as revenue
 * because it completed once. PARKED is an open bill nobody has paid and
 * VOIDED is a cancelled sale — both would invent money.
 *
 * The summary is aggregated over the whole WINDOW, not over the rows on
 * screen: a busy month past the row cap must still report what it took.
 */

const router = Router();

/** Revenue-bearing states — identical to admin-metrics.ts. */
const SETTLED: TransactionStatus[] = [
  TransactionStatus.COMPLETED,
  TransactionStatus.PARTIALLY_REFUNDED,
  TransactionStatus.REFUNDED,
];

const RUPIAH_TO_MINOR = 100;
const MAX_ROWS = 500;

function clampDays(raw: unknown): number {
  const n = typeof raw === 'string' ? Number(raw) : 30;
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), 365) : 30;
}

router.get('/', async (req, res) => {
  const days = clampDays(req.query.days);
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const where = { status: { in: SETTLED }, createdAt: { gte: from, lte: to } };

  try {
    const [rows, agg, payers] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        select: {
          id: true,
          accountId: true,
          number: true,
          status: true,
          total: true,
          refundedTotal: true,
          createdAt: true,
          outlet: { select: { name: true } },
        },
      }),
      // Over the WINDOW, not over `rows` — see the header.
      prisma.transaction.aggregate({
        where,
        _count: { _all: true },
        _sum: { total: true, refundedTotal: true },
      }),
      prisma.transaction
        .findMany({ where, distinct: ['accountId'], select: { accountId: true } })
        .then((r) => r.length),
    ]);

    const payload = {
      rows: rows.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        // The shop's workspace. Its shoppers are that shop's customers,
        // not ours, and do not go on this page.
        customer: r.accountId,
        // A refund is a distinct KIND so the panel's filter can isolate
        // it — an operator chasing a disputed sale should not have to
        // read every row to find the ones that went backwards.
        kind: r.refundedTotal > 0 ? 'refund' : 'payment',
        // Net of refunds, per row, for the same reason the summary is.
        amountMinor: (r.total - r.refundedTotal) * RUPIAH_TO_MINOR,
        currency: 'IDR',
        status: r.status.toLowerCase(),
        description: r.outlet?.name ? `${r.number} · ${r.outlet.name}` : r.number,
      })),
      summary: {
        count: agg._count?._all ?? 0,
        grossMinor:
          ((agg._sum?.total ?? 0) - (agg._sum?.refundedTotal ?? 0)) * RUPIAH_TO_MINOR,
        currency: 'IDR',
        payers,
      },
      note: 'Shop sales rung up through Malapos, net of refunds — the volume the platform carries, not Malapos subscription revenue.',
    };
    return sendOk(res, req, payload);
  } catch (e) {
    return sendErr(res, req, 500, 'TRANSACTIONS_FAILED', (e as Error).message);
  }
});

export default router;
