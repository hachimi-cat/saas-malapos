import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { sendOk } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';

/*
 * /api/v1/reports — read-only sales + inventory aggregations (behind
 * requireAuth). Every query is scoped by accountId; sales metrics also
 * filter status='COMPLETED'. Date range defaults to the last 30 days.
 *
 *   GET /summary        headline KPIs + payment-method breakdown
 *   GET /top-products    best sellers by quantity
 *   GET /sales-by-day    daily sales buckets
 *   GET /low-stock       stock at/below reorder point
 */

const router = Router();

const DAY_MS = 24 * 60 * 60 * 1000;

/** Resolve ?from=&to= ISO dates into a [start, end) range; default last 30d. */
function resolveRange(query: Record<string, string | undefined>): { from: Date; to: Date } {
  const parsed = z
    .object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() })
    .parse({ from: query.from, to: query.to });
  const to = parsed.to ? new Date(parsed.to) : new Date();
  const from = parsed.from ? new Date(parsed.from) : new Date(to.getTime() - 30 * DAY_MS);
  // Exclusive end: include the whole `to` day when only a date was given.
  const end = parsed.to ? new Date(new Date(parsed.to).getTime() + DAY_MS) : to;
  return { from, to: end };
}

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const query = req.query as Record<string, string | undefined>;
    const { outletId } = query;
    const { from, to } = resolveRange(query);

    const txWhere = {
      accountId,
      status: 'COMPLETED' as const,
      ...(outletId ? { outletId } : {}),
      createdAt: { gte: from, lt: to },
    };

    const agg = await prisma.transaction.aggregate({
      where: txWhere,
      _count: { _all: true },
      _sum: { total: true, subtotal: true, discountTotal: true, taxTotal: true },
    });

    const salesCount = agg._count._all;
    const gross = agg._sum.total ?? 0;
    const subtotalSum = agg._sum.subtotal ?? 0;
    const discounts = agg._sum.discountTotal ?? 0;
    const tax = agg._sum.taxTotal ?? 0;
    const net = gross - tax;
    const avgTicket = salesCount > 0 ? Math.round(gross / salesCount) : 0;

    // Payment-method breakdown — PAID payments on COMPLETED transactions in range.
    const byMethodRows = await prisma.payment.groupBy({
      by: ['method'],
      where: { accountId, status: 'PAID', transaction: txWhere },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const byMethod = byMethodRows.map((r) => ({
      method: r.method,
      total: r._sum.amount ?? 0,
      count: r._count._all,
    }));

    sendOk(res, req, {
      salesCount,
      gross,
      subtotalSum,
      discounts,
      tax,
      net,
      avgTicket,
      byMethod,
    });
  }),
);

router.get(
  '/top-products',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const query = req.query as Record<string, string | undefined>;
    const { outletId } = query;
    const { from, to } = resolveRange(query);
    const limit = z.coerce.number().int().min(1).max(100).default(10).parse(query.limit);

    const items = await prisma.transactionItem.findMany({
      where: {
        accountId,
        transaction: {
          accountId,
          status: 'COMPLETED',
          ...(outletId ? { outletId } : {}),
          createdAt: { gte: from, lt: to },
        },
      },
      select: {
        variantId: true,
        productName: true,
        variantName: true,
        quantity: true,
        lineTotal: true,
      },
    });

    const grouped = new Map<
      string,
      { variantId: string | null; productName: string; variantName: string | null; qty: number; revenue: number }
    >();
    for (const it of items) {
      const key = it.variantId ?? `__deleted__${it.productName}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.qty += it.quantity;
        existing.revenue += it.lineTotal;
      } else {
        grouped.set(key, {
          variantId: it.variantId,
          productName: it.productName,
          variantName: it.variantName,
          qty: it.quantity,
          revenue: it.lineTotal,
        });
      }
    }

    const topProducts = [...grouped.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
    sendOk(res, req, { topProducts });
  }),
);

router.get(
  '/sales-by-day',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const query = req.query as Record<string, string | undefined>;
    const { outletId } = query;
    const days = z.coerce.number().int().min(1).max(365).default(30).parse(query.days);

    // ?days= takes precedence over the default range when from/to absent.
    const to = query.to ? resolveRange(query).to : new Date();
    const from = query.from
      ? resolveRange(query).from
      : new Date(to.getTime() - days * DAY_MS);

    const rows = await prisma.transaction.findMany({
      where: {
        accountId,
        status: 'COMPLETED',
        ...(outletId ? { outletId } : {}),
        createdAt: { gte: from, lt: to },
      },
      select: { createdAt: true, total: true },
    });

    const buckets = new Map<string, { date: string; count: number; total: number }>();
    for (const r of rows) {
      const date = r.createdAt.toISOString().slice(0, 10);
      const b = buckets.get(date);
      if (b) {
        b.count += 1;
        b.total += r.total;
      } else {
        buckets.set(date, { date, count: 1, total: r.total });
      }
    }

    const salesByDay = [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
    sendOk(res, req, { salesByDay });
  }),
);

router.get(
  '/low-stock',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { outletId } = req.query as Record<string, string | undefined>;

    const rows = await prisma.stockLevel.findMany({
      where: {
        accountId,
        reorderPoint: { gt: 0 },
        ...(outletId ? { outletId } : {}),
      },
      include: { variant: { include: { product: { select: { name: true } } } } },
      orderBy: { quantity: 'asc' },
    });

    // reorderPoint is per-row, so the quantity<=reorderPoint compare is in JS.
    const lowStock = rows.filter((r) => r.quantity <= r.reorderPoint);
    sendOk(res, req, { lowStock });
  }),
);

export default router;
