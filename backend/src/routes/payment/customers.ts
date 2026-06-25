import { Router } from 'express';
import { z } from 'zod';
import { sendOk, sendCreated, sendList } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireMerchantClient, handlePlugipayError } from '../../services/plugipay-proxy.js';

/*
 * /api/v1/payments/customers — payment customers on the merchant's
 * Plugipay workspace (distinct from the POS customer book at
 * /api/v1/customers). malapos port of storlaunch's payment/customers.ts.
 * requireAuth at the mount.
 */

const router = Router();

const createCustomerSchema = z.object({
  email: z.string().email(),
  name: z.string().max(200).optional().nullable(),
  metadata: z.record(z.string()).optional(),
});

const updateCustomerSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().max(200).optional().nullable(),
});

const listCustomersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  email: z.string().optional(),
});

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const body = createCustomerSchema.parse(req.body);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const customer = await client.customers.create({
        email: body.email,
        name: body.name ?? undefined,
        metadata: body.metadata,
      });
      return sendCreated(res, req, customer);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const query = listCustomersSchema.parse(req.query);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const page = await client.customers.list({
        limit: query.limit,
        cursor: query.cursor,
        email: query.email,
      });
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
      const customer = await client.customers.get(String(req.params.id));
      return sendOk(res, req, customer);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res, next) => {
    try {
      const body = updateCustomerSchema.parse(req.body);
      const client = await requireMerchantClient(req.auth!.accountId as string);
      const customer = await client.customers.update(String(req.params.id), {
        ...(body.email ? { email: body.email } : {}),
        ...(body.name !== undefined ? { name: body.name ?? undefined } : {}),
      });
      return sendOk(res, req, customer);
    } catch (err) {
      return handlePlugipayError(res, req, err, next);
    }
  }),
);

export default router;
