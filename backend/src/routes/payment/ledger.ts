import { Router } from 'express';
import type { LedgerEntry } from '@forjio/plugipay-node';
import { sendOk, sendErr, sendList } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handlePlugipayError } from '../../services/plugipay-proxy.js';

/*
 * /api/v1/payments/ledger — the merchant's running money log on their
 * Plugipay workspace. malapos port of storlaunch's routes/ledger.ts,
 * trimmed to the Plugipay-backed surface (malapos has no local ledger,
 * so the per-customer-balance + manual-adjustment endpoints are dropped).
 * requireAuth at the mount.
 */

const router = Router();

type LedgerCategory =
  | 'sale'
  | 'refund'
  | 'platform_fee'
  | 'channel_fee'
  | 'shipping_cost'
  | 'shipping_refund'
  | 'payout'
  | 'adjustment';

function deriveCategory(code: string | null | undefined): LedgerCategory | null {
  if (!code) return null;
  if (code.startsWith('revenue:')) return 'sale';
  if (code.startsWith('refund')) return 'refund';
  if (code.startsWith('platform_fee')) return 'platform_fee';
  if (code.startsWith('channel_fee')) return 'channel_fee';
  if (code.startsWith('shipping_cost')) return 'shipping_cost';
  if (code.startsWith('shipping_refund')) return 'shipping_refund';
  if (code === 'payout' || code.startsWith('payout')) return 'payout';
  if (code.startsWith('adjustment')) return 'adjustment';
  return null;
}

// Plugipay ledger row → the UI shape (category/type/createdAt/description/
// transactionId + zeroed running balances).
function transformLedgerRow(accountId: string, r: LedgerEntry) {
  return {
    id: r.id,
    accountId,
    customerId: null,
    customer: null,
    transactionId: r.txId ?? r.id,
    sourceType: r.sourceType ?? null,
    sourceId: r.sourceId ?? null,
    category: deriveCategory(r.code),
    type: r.direction,
    amount: r.amount,
    currency: r.currency,
    description: r.memo ?? '',
    balanceBefore: 0,
    balanceAfter: 0,
    createdAt: r.postedAt ?? new Date().toISOString(),
  };
}

router.get(
  '/entries',
  asyncHandler(async (req, res, next) => {
    try {
      const accountId = req.auth!.accountId as string;
      const client = await requireMerchantClient(accountId);
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 100);
      const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
      const page = await client.ledger.list({
        limit,
        cursor,
        sourceType: req.query.sourceType ? String(req.query.sourceType) : undefined,
        sourceId: req.query.sourceId ? String(req.query.sourceId) : undefined,
        code: req.query.code ? String(req.query.code) : undefined,
      });
      const transformed = page.data.map((r) => transformLedgerRow(accountId, r));
      return sendList(res, req, transformed, page.cursor, page.hasMore);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

// CSV export — up to 10k rows.
router.get(
  '/entries.csv',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const rows: LedgerEntry[] = [];
      const MAX = 10000;
      let cursor: string | undefined = undefined;
      while (rows.length < MAX) {
        const page = await client.ledger.list({ limit: 100, cursor });
        rows.push(...page.data);
        if (!page.hasMore || !page.cursor) break;
        cursor = page.cursor;
      }
      const esc = (v: unknown): string => {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ['id', 'posted_at', 'code', 'direction', 'amount', 'currency', 'memo', 'source_type', 'source_id', 'tx_id'].join(',');
      const body = rows
        .map((r) =>
          [r.id, r.postedAt ?? '', r.code ?? '', r.direction ?? '', r.amount, r.currency, r.memo ?? '', r.sourceType ?? '', r.sourceId ?? '', r.txId ?? '']
            .map(esc)
            .join(','),
        )
        .join('\n');
      const csv = `${header}\n${body}\n`;
      const filename = `ledger-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.get(
  '/entries/:id',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const page = await client.ledger.list({ limit: 100 });
      const entry = page.data.find((e) => e.id === String(req.params.id));
      if (!entry) return sendErr(res, req, 404, 'NOT_FOUND', 'Ledger entry not found');
      return sendOk(res, req, entry);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

// ─── Balance ─────────────────────────────────────────────────────────
router.get(
  '/balance',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const balances = await client.ledger.balances();
      const balance = balances.reduce((sum, b) => sum + b.balance, 0);
      return sendOk(res, req, { balance, currency: 'IDR', byCode: balances });
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

export default router;
