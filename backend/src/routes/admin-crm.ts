import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { sendOk } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';

/*
 * /api/v1/admin/crm — the standardized Forjio CRM contract (stats /
 * customers / transactions), served s2s to the central admin portal
 * behind adminGuard's X-Forjio-Admin-Secret path.
 *
 * Malapos semantics: a "customer" at the CRM level is a MERCHANT
 * WORKSPACE running Malapos (seller identity lives in Huudis — the
 * central portal enriches each accountId to its workspace owner). The
 * per-outlet shopper records in the `customers` table are a different,
 * merchant-private concept and are NOT what the operator console shows.
 * "Transactions" here are POS sales (the Transaction model).
 */

const router = Router();

const fmtCount = (n: number) => n.toLocaleString('en-US');
const fmtIdr = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [merchants, sales, sales30d, completed, revenueAgg] = await Promise.all([
      prisma.transaction.groupBy({ by: ['accountId'] }).then((r) => r.length),
      prisma.transaction.count(),
      prisma.transaction.count({ where: { createdAt: { gte: since30d } } }),
      prisma.transaction.count({ where: { status: 'COMPLETED' } }),
      prisma.transaction.aggregate({
        _sum: { total: true },
        where: { status: 'COMPLETED' },
      }),
    ]);
    const revenue = revenueAgg._sum.total ?? 0;
    sendOk(res, req, {
      stats: [
        { key: 'merchants', label: 'Merchants with sales', value: fmtCount(merchants) },
        { key: 'sales', label: 'Sales (lifetime)', value: fmtCount(sales), accent: true },
        { key: 'sales30d', label: 'Sales (30d)', value: fmtCount(sales30d), accent: sales30d > 0 },
        { key: 'completed', label: 'Completed', value: fmtCount(completed) },
        { key: 'gmv', label: 'GMV (completed)', value: fmtIdr(revenue) },
      ],
    });
  }),
);

router.get(
  '/customers',
  asyncHandler(async (req, res) => {
    // Malapos's CRM "customers" are the MERCHANT WORKSPACES selling
    // through Malapos. We group sales by accountId; the central portal
    // resolves each accountId to its Huudis workspace owner (email/name),
    // so we leave those null here and surface the activity metrics.
    const grouped = await prisma.transaction.groupBy({
      by: ['accountId'],
      _count: { _all: true },
      _sum: { total: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });
    const customers = await Promise.all(
      grouped.map(async (g) => {
        const [completedCount, outlets] = await Promise.all([
          prisma.transaction.count({
            where: { accountId: g.accountId, status: 'COMPLETED' },
          }),
          prisma.outlet.count({ where: { accountId: g.accountId } }),
        ]);
        const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return {
          id: g.accountId,
          email: null as string | null,
          name: g.accountId,
          signupAt: g._min.createdAt,
          lastActiveAt: g._max.createdAt,
          status:
            g._max.createdAt && g._max.createdAt.getTime() >= since30d.getTime()
              ? 'active'
              : 'quiet',
          metrics: [
            { label: 'Sales', value: fmtCount(g._count._all) },
            { label: 'Completed', value: fmtCount(completedCount) },
            { label: 'GMV', value: fmtIdr(g._sum.total ?? 0) },
            { label: 'Outlets', value: fmtCount(outlets) },
          ],
          // Raw numbers for the in-product admin portal (the central
          // portal reads the formatted `metrics` above).
          salesCount: g._count._all,
          completedCount,
          gmvIdr: g._sum.total ?? 0,
          outletCount: outlets,
        };
      }),
    );
    sendOk(res, req, { customers });
  }),
);

router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [sales, total, completed, revenue30d] = await Promise.all([
      prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          outlet: { select: { name: true } },
          customer: { select: { name: true } },
        },
      }),
      prisma.transaction.count(),
      prisma.transaction.count({ where: { status: 'COMPLETED' } }),
      prisma.transaction.aggregate({
        _sum: { total: true },
        where: { status: 'COMPLETED', createdAt: { gte: since30d } },
      }),
    ]);
    sendOk(res, req, {
      summary: [
        { label: 'Sales (lifetime)', value: fmtCount(total) },
        { label: 'Completed', value: fmtCount(completed) },
        { label: 'GMV (30d)', value: fmtIdr(revenue30d._sum.total ?? 0) },
      ],
      rows: sales.map((s) => ({
        id: s.id,
        at: s.createdAt,
        customer: s.customer?.name ?? null,
        kind: 'sale',
        amount: s.total,
        status: s.status,
        description: `#${s.number} · ${s.outlet.name}`,
        // Sale detail for the in-product admin portal (additive — the
        // central portal reads only the standardized fields above).
        number: s.number,
        outletName: s.outlet.name,
        accountId: s.accountId,
        subtotal: s.subtotal,
        taxTotal: s.taxTotal,
      })),
    });
  }),
);

export default router;
