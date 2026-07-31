import { Router } from 'express';
import { sendOk, sendErr } from '../lib/http.js';
import { TransactionStatus } from '@prisma/client';
import { prisma } from '../lib/db.js';
import {
  collectBusinessMetrics,
  defaultWindow,
  type MetricsAdapter,
} from '../lib/business-metrics.js';

/*
 * GET /api/v1/admin/metrics?days=30 — malapos's business metrics.
 *
 * Mounted behind `adminGuard`; powers `BusinessMetricsPanel` and the
 * headline tiles on `AdminOverviewPanel`. Mandatory admin-portal standard.
 *
 * WHOSE MONEY IS THIS? Malapos is a POS: the transactions below are the
 * MERCHANTS' sales through the product, not malapos's own subscription
 * revenue. That is the number an operator actually wants — it is the
 * volume the platform is carrying — but it must not be mistaken for
 * takings. Malapos's own billing lives in BillingSubscription.
 *
 * `Customer` in this schema is a SHOP'S buyer, not a product user, so it
 * is deliberately absent from the user counts.
 *
 * Amounts are whole RUPIAH; the contract carries MINOR units, hence x100.
 */

const RUPIAH_TO_MINOR = 100;

/** Revenue-bearing states. PARKED is an open bill nobody has paid and
 *  VOIDED is a cancelled sale — counting either would invent money.
 *  Refunded states stay IN, because their refundedTotal is subtracted
 *  below rather than the whole sale being dropped. */
const SETTLED: TransactionStatus[] = [
  TransactionStatus.COMPLETED,
  TransactionStatus.PARTIALLY_REFUNDED,
  TransactionStatus.REFUNDED,
];

const adapter: MetricsAdapter = {
  workspaces: async ({ from }) => {
    const [total, active] = await Promise.all([
      prisma.outlet
        .findMany({ distinct: ['accountId'], select: { accountId: true } })
        .then((r) => r.length),
      // A POS tenant is "active" if it rang up a sale in the window. A
      // configured outlet that never sells is not an active business.
      prisma.transaction
        .findMany({
          where: { createdAt: { gte: from } },
          distinct: ['accountId'],
          select: { accountId: true },
        })
        .then((r) => r.length),
    ]);
    return { total, active };
  },

  // Malapos has no roster table. Distinct cashiers who have rung up a
  // sale is the honest proxy for "people who actually use this product" —
  // better than reporting 0 and far better than counting shop customers.
  workspaceMembers: async () =>
    prisma.transaction
      .findMany({
        where: { cashierSub: { not: null } },
        distinct: ['cashierSub'],
        select: { cashierSub: true },
      })
      .then((r) => r.length),

  transactions: async ({ from, to }) => {
    const where = {
      status: { in: SETTLED },
      createdAt: { gte: from, lte: to },
    };
    const [agg, payers] = await Promise.all([
      prisma.transaction.aggregate({
        where,
        _count: { _all: true },
        // NET, not gross: a refunded sale must not keep counting as
        // revenue just because it completed once.
        _sum: { total: true, refundedTotal: true },
      }),
      prisma.transaction
        .findMany({ where, distinct: ['accountId'], select: { accountId: true } })
        .then((r) => r.length),
    ]);
    const net = (agg._sum?.total ?? 0) - (agg._sum?.refundedTotal ?? 0);
    return {
      count: agg._count?._all ?? 0,
      grossMinor: net * RUPIAH_TO_MINOR,
      currency: 'IDR',
      payers,
    };
  },

  series: async ({ from, to }) => {
    // Grouped in SQL — a POS transaction table is the highest-volume one
    // in the family and a 365-day window would otherwise load every row.
    const rows = await prisma.$queryRaw<
      { day: Date; sales: bigint; net: bigint | null }[]
    >`
      SELECT date_trunc('day', "createdAt")        AS day,
             COUNT(*)                              AS sales,
             SUM("total" - "refundedTotal")        AS net
      FROM transactions
      WHERE "status" IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND "createdAt" >= ${from}
        AND "createdAt" <= ${to}
      GROUP BY 1
      ORDER BY 1
    `;
    return rows.map((r) => ({
      at: r.day.toISOString(),
      users: 0,
      transactions: Number(r.sales),
      grossMinor: Number(r.net ?? 0) * RUPIAH_TO_MINOR,
    }));
  },
};

const router = Router();

router.get('/', async (req, res) => {
  const raw = typeof req.query.days === 'string' ? Number(req.query.days) : 30;
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 365) : 30;
  try {
    return sendOk(res, req, await collectBusinessMetrics(adapter, defaultWindow(days)));
  } catch (e) {
    return sendErr(res, req, 500, 'METRICS_COLLECT_FAILED', (e as Error).message);
  }
});

export default router;
