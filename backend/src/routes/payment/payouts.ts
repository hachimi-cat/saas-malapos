import { Router } from 'express';
import { z } from 'zod';
import type { PayoutStatus } from '@forjio/plugipay-node';
import { sendOk, sendCreated, sendList } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handlePlugipayError } from '../../services/plugipay-proxy.js';

/*
 * /api/v1/payments/payouts — payouts + bank-account config + balance on
 * the merchant's Plugipay workspace. malapos port of storlaunch's
 * routes/payouts.ts. requireAuth at the mount.
 */

const router = Router();

const bankAccountSchema = z.object({
  bankCode: z.string().max(32).optional().nullable(),
  bankName: z.string().min(1).max(100),
  bankAccountNumber: z.string().min(1).max(50),
  bankAccountHolder: z.string().min(1).max(100),
});

const createSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.enum(['IDR', 'USD']).default('IDR'),
  bankCode: z.string().max(32).optional().nullable(),
  bankName: z.string().max(100).optional(),
  bankAccountNumber: z.string().max(50).optional(),
  bankAccountHolder: z.string().max(100).optional(),
  note: z.string().max(500).optional().nullable(),
});

const transitionSchema = z.object({
  reference: z.string().max(200).optional().nullable(),
});

const failSchema = z.object({
  failureReason: z.string().min(1).max(500),
});

// ─── Bank account config ─────────────────────────────────────────────
router.get(
  '/bank-account',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const r = await client.payouts.getBankAccount();
      return sendOk(res, req, r);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.patch(
  '/bank-account',
  asyncHandler(async (req, res, next) => {
    try {
      const body = bankAccountSchema.parse(req.body);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const r = await client.payouts.updateBankAccount(body);
      return sendOk(res, req, r);
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
      const r = await client.payouts.balance();
      return sendOk(res, req, r);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

// ─── List / get ──────────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 100);
      const status = req.query.status ? (String(req.query.status) as PayoutStatus) : undefined;
      const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
      const page = await client.payouts.list({ limit, status, cursor });
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
      const r = await client.payouts.get(String(req.params.id));
      return sendOk(res, req, r);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

// ─── Create / cancel ─────────────────────────────────────────────────
router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const body = createSchema.parse(req.body);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const r = await client.payouts.create({
        amount: body.amount,
        currency: body.currency,
        bankCode: body.bankCode,
        bankName: body.bankName,
        bankAccountNumber: body.bankAccountNumber,
        bankAccountHolder: body.bankAccountHolder,
        note: body.note,
      });
      return sendCreated(res, req, r);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.post(
  '/:id/cancel',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const r = await client.payouts.cancel(String(req.params.id));
      return sendOk(res, req, r);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

// ─── Status transitions ──────────────────────────────────────────────
router.post(
  '/:id/mark-in-transit',
  asyncHandler(async (req, res, next) => {
    try {
      const body = transitionSchema.parse(req.body);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const r = await client.payouts.markInTransit(String(req.params.id), body.reference);
      return sendOk(res, req, r);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.post(
  '/:id/mark-paid',
  asyncHandler(async (req, res, next) => {
    try {
      const body = transitionSchema.parse(req.body);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const r = await client.payouts.markPaid(String(req.params.id), body.reference);
      return sendOk(res, req, r);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.post(
  '/:id/mark-failed',
  asyncHandler(async (req, res, next) => {
    try {
      const body = failSchema.parse(req.body);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const r = await client.payouts.markFailed(String(req.params.id), body.failureReason);
      return sendOk(res, req, r);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

export default router;
