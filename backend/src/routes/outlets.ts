import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk, sendCreated, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { enforceLimit } from '../lib/entitlements.js';

/*
 * /api/v1/outlets — store locations (behind requireAuth). Stock, shifts,
 * receipt numbering and tax are all scoped per outlet. A workspace always
 * has at least one (the sell screen requires picking one).
 */

const router = Router();

const optionalText = (max: number) => z.string().trim().max(max).nullish();

const createBody = z.object({
  name: z.string().trim().min(1).max(120),
  address: optionalText(500),
  phone: optionalText(40),
  timezone: z.string().trim().max(64).optional().default('Asia/Jakarta'),
  taxRateBps: z.number().int().min(0).max(10000).optional().default(0),
  taxInclusive: z.boolean().optional().default(false),
  receiptHeader: optionalText(500),
  receiptFooter: optionalText(500),
});

const patchBody = createBody.partial().extend({
  isActive: z.boolean().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const outlets = await prisma.outlet.findMany({
      where: { accountId },
      orderBy: { createdAt: 'asc' },
    });
    sendOk(res, req, { outlets });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = createBody.parse(req.body);
    const existing = await prisma.outlet.count({ where: { accountId } });
    await enforceLimit(accountId, 'outletLimit', existing);
    const outlet = await prisma.outlet.create({
      data: { id: newId('out'), accountId, ...body },
    });
    sendCreated(res, req, { outlet });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const outlet = await prisma.outlet.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!outlet) throw new ApiError(404, 'NOT_FOUND', 'Outlet not found');
    sendOk(res, req, { outlet });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = patchBody.parse(req.body);
    const existing = await prisma.outlet.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Outlet not found');
    const outlet = await prisma.outlet.update({ where: { id: existing.id }, data: body });
    sendOk(res, req, { outlet });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const existing = await prisma.outlet.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Outlet not found');
    const sales = await prisma.transaction.count({ where: { outletId: existing.id } });
    if (sales > 0) {
      // History references it — deactivate instead of orphaning sales.
      const outlet = await prisma.outlet.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      return sendOk(res, req, { outlet, deactivated: true });
    }
    await prisma.outlet.delete({ where: { id: existing.id } });
    sendOk(res, req, { id: existing.id, deleted: true });
  }),
);

export default router;
