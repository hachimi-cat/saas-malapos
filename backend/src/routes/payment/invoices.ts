import { Router } from 'express';
import { z } from 'zod';
import type { Invoice } from '@forjio/plugipay-node';
import { sendOk, sendList } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handlePlugipayError } from '../../services/plugipay-proxy.js';
import { streamFromPlugipay } from '../../services/plugipay-raw-proxy.js';

/*
 * /api/v1/payments/invoices — read-only invoice surface on the
 * merchant's Plugipay workspace + binary PDF/HTML passthrough. malapos
 * port of storlaunch's payment/invoices.ts. requireAuth at the mount.
 */

const router = Router();

const listInvoicesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  status: z.string().optional(),
  customerId: z.string().optional(),
});

// Plugipay invoice DTO uses total/lines; the UI also reads amount/lineItems/
// pdfUrl/dueDate. Expose both so the list + detail pages render cleanly.
function shimInvoice(inv: Invoice): Record<string, unknown> {
  return {
    ...inv,
    amount: inv.total ?? 0,
    lineItems: (inv.lines ?? []).map((l) => ({
      description: l.description,
      amount: l.amount ?? l.unitAmount * l.quantity,
      quantity: l.quantity,
    })),
    pdfUrl: inv.hostedInvoiceUrl ?? null,
    dueDate: inv.dueAt ?? null,
  };
}

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const query = listInvoicesSchema.parse(req.query);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const page = await client.invoices.list({
        limit: query.limit,
        cursor: query.cursor,
        status: query.status,
        customerId: query.customerId,
      });
      const shimmed = page.data.map(shimInvoice);
      return sendList(res, req, shimmed, page.cursor, page.hasMore);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

// CSV export — up to 10k rows via paginated SDK fetch.
router.get(
  '/export.csv',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const rows: Invoice[] = [];
      const MAX = 10000;
      let cursor: string | undefined = undefined;
      while (rows.length < MAX) {
        const page = await client.invoices.list({ limit: 100, cursor });
        rows.push(...page.data);
        if (!page.hasMore || !page.cursor) break;
        cursor = page.cursor;
      }
      const esc = (v: unknown): string => {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ['id', 'number', 'status', 'customer_id', 'currency', 'total', 'amount_paid', 'amount_due', 'due_at', 'paid_at', 'created_at'].join(',');
      const body = rows
        .map((r) =>
          [r.id, r.number ?? '', r.status, r.customerId ?? '', r.currency, r.total ?? 0, r.amountPaid ?? 0, r.amountDue ?? 0, r.dueAt ?? '', r.paidAt ?? '', r.createdAt]
            .map(esc)
            .join(','),
        )
        .join('\n');
      const csv = `${header}\n${body}\n`;
      const filename = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const inv = await client.invoices.get(String(req.params.id));
      return sendOk(res, req, shimInvoice(inv));
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

// PDF / HTML preview — streamed straight from Plugipay's hosted endpoints.
router.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    await streamFromPlugipay(res, req.auth!.accountId as string, `/api/v1/invoices/${req.params.id}/invoice.pdf`);
  }),
);

router.get(
  '/:id/html',
  asyncHandler(async (req, res) => {
    await streamFromPlugipay(res, req.auth!.accountId as string, `/api/v1/invoices/${req.params.id}/invoice.html`);
  }),
);

export default router;
