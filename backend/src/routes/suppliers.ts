import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk, sendCreated, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';

/*
 * /api/v1/suppliers — vendor directory (behind requireAuth).
 *
 *   GET    /     list (name asc); ?q= name contains
 *   POST   /     create
 *   GET    /:id
 *   PATCH  /:id
 *   DELETE /:id  hard delete if unreferenced, else deactivate
 */

const router = Router();

const optionalText = (max: number) => z.string().trim().max(max).nullish();

const createBody = z.object({
  name: z.string().trim().min(1).max(160),
  contact: optionalText(160),
  phone: optionalText(40),
  email: optionalText(160),
  address: optionalText(500),
  note: optionalText(1000),
});

const patchBody = createBody.partial().extend({
  isActive: z.boolean().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { q } = req.query as Record<string, string | undefined>;
    const suppliers = await prisma.supplier.findMany({
      where: {
        accountId,
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
    });
    sendOk(res, req, { suppliers });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = createBody.parse(req.body);
    const supplier = await prisma.supplier.create({
      data: { id: newId('sup'), accountId, ...body },
    });
    sendCreated(res, req, { supplier });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const supplier = await prisma.supplier.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!supplier) throw new ApiError(404, 'NOT_FOUND', 'Supplier not found');
    sendOk(res, req, { supplier });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = patchBody.parse(req.body);
    const existing = await prisma.supplier.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Supplier not found');
    const supplier = await prisma.supplier.update({ where: { id: existing.id }, data: body });
    sendOk(res, req, { supplier });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const existing = await prisma.supplier.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Supplier not found');
    const orders = await prisma.purchaseOrder.count({ where: { supplierId: existing.id } });
    if (orders > 0) {
      // POs reference it — deactivate instead of orphaning history.
      const supplier = await prisma.supplier.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      return sendOk(res, req, { supplier, deactivated: true });
    }
    await prisma.supplier.delete({ where: { id: existing.id } });
    sendOk(res, req, { id: existing.id, deleted: true });
  }),
);

export default router;
