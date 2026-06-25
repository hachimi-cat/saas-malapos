import { Router } from 'express';
import { z } from 'zod';
import type { PnLReport, CashFlowReport } from '@forjio/plugipay-node';
import { sendOk, sendErr } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handlePlugipayError } from '../../services/plugipay-proxy.js';

/*
 * /api/v1/payments/reports — P&L + cash-flow over a date range, derived
 * from the merchant's Plugipay ledger. malapos port of storlaunch's
 * routes/reports.ts. requireAuth at the mount.
 */

const router = Router();

const periodSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  currency: z.string().length(3).optional(),
});

function parsePeriod(
  q: unknown,
): { ok: true; value: { from: Date; to: Date; currency?: string } } | { ok: false; message: string } {
  const parsed = periodSchema.safeParse(q);
  if (!parsed.success) return { ok: false, message: 'from + to (ISO datetime) are required' };
  const fromDate = new Date(parsed.data.from);
  const toDate = new Date(parsed.data.to);
  if (fromDate > toDate) return { ok: false, message: '`from` must be on/before `to`' };
  return { ok: true, value: { from: fromDate, to: toDate, currency: parsed.data.currency } };
}

// Plugipay's flat report shape → the structured shape the UI renders.
function transformPnl(p: PnLReport) {
  return {
    period: { from: p.from, to: p.to },
    currency: p.currency,
    revenue: {
      sales: p.revenue ?? 0,
      refunds: p.refunds ?? 0,
      net: (p.revenue ?? 0) - (p.refunds ?? 0),
    },
    expenses: {
      platformFees: p.platformFees ?? 0,
      channelFees: 0,
      shippingCosts: 0,
      shippingRefunds: 0,
      total: p.platformFees ?? 0,
    },
    netProfit: p.net ?? 0,
    entryCount: p.lines?.length ?? 0,
  };
}

function transformCashFlow(p: CashFlowReport) {
  return {
    period: { from: p.from, to: p.to },
    currency: p.currency,
    openingBalance: 0,
    closingBalance: p.net ?? 0,
    netChange: p.net ?? 0,
    inflows: {} as Record<string, number>,
    outflows: {} as Record<string, number>,
    totalIn: p.totalInflow ?? 0,
    totalOut: p.totalOutflow ?? 0,
    entryCount: p.buckets?.length ?? 0,
  };
}

router.get(
  '/pnl',
  asyncHandler(async (req, res, next) => {
    try {
      const period = parsePeriod(req.query);
      if (!period.ok) return sendErr(res, req, 400, 'INVALID_PERIOD', period.message);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const report = await client.reports.pnl({
        from: period.value.from.toISOString(),
        to: period.value.to.toISOString(),
        currency: period.value.currency,
      });
      return sendOk(res, req, transformPnl(report));
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.get(
  '/cash-flow',
  asyncHandler(async (req, res, next) => {
    try {
      const period = parsePeriod(req.query);
      if (!period.ok) return sendErr(res, req, 400, 'INVALID_PERIOD', period.message);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const report = await client.reports.cashFlow({
        from: period.value.from.toISOString(),
        to: period.value.to.toISOString(),
        currency: period.value.currency,
      });
      return sendOk(res, req, transformCashFlow(report));
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

export default router;
