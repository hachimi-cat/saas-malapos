import { Router } from 'express';
import { sendOk, sendList } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handlePlugipayError } from '../../services/plugipay-proxy.js';
import { streamFromPlugipay } from '../../services/plugipay-raw-proxy.js';

/*
 * /api/v1/payments/receipts — receipts on the merchant's Plugipay
 * workspace, email-a-receipt, and binary PDF/HTML/ESC-POS passthrough.
 * malapos port of storlaunch's payment/receipts.ts. requireAuth at the
 * mount.
 */

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const limit = Math.min(Number(req.query.limit ?? 25) || 25, 100);
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const sourceType =
        req.query.sourceType === 'invoice' || req.query.sourceType === 'checkout_session'
          ? (req.query.sourceType as 'invoice' | 'checkout_session')
          : undefined;
      const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
      const page = await client.receipts.list({ limit, cursor, sourceType, customerId });
      return sendList(res, req, page.data, page.cursor, page.hasMore);
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
      const receipt = await client.receipts.get(String(req.params.id));
      return sendOk(res, req, receipt);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

// Email a receipt to the customer. `to` optional — falls back to the
// receipt's customer email on the Plugipay side.
router.post(
  '/:id/email',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const to = typeof req.body?.to === 'string' ? req.body.to : undefined;
      const result = await client.request<{ sent: boolean; to: string }>({
        method: 'POST',
        path: `/api/v1/receipts/${req.params.id}/email`,
        body: to ? { to } : {},
      });
      return sendOk(res, req, result);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

// Binary passthroughs — PDF, HTML, ESC/POS thermal.
router.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    await streamFromPlugipay(res, req.auth!.accountId as string, `/api/v1/receipts/${req.params.id}/receipt.pdf`);
  }),
);

router.get(
  '/:id/html',
  asyncHandler(async (req, res) => {
    await streamFromPlugipay(res, req.auth!.accountId as string, `/api/v1/receipts/${req.params.id}/receipt.html`);
  }),
);

router.get(
  '/:id/escpos',
  asyncHandler(async (req, res) => {
    const width = req.query.width === '80' ? '80' : '58';
    await streamFromPlugipay(res, req.auth!.accountId as string, `/api/v1/receipts/${req.params.id}/receipt.escpos?width=${width}`);
  }),
);

export default router;
