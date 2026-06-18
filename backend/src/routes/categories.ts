import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk, sendCreated, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';

/* /api/v1/categories — catalog grouping (behind requireAuth). */

const router = Router();

const body = z.object({
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const categories = await prisma.category.findMany({
      where: { accountId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    sendOk(res, req, { categories });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const data = body.parse(req.body);
    const category = await prisma.category.create({ data: { id: newId('cat'), accountId, ...data } });
    sendCreated(res, req, { category });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const data = body.partial().parse(req.body);
    const existing = await prisma.category.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Category not found');
    const category = await prisma.category.update({ where: { id: existing.id }, data });
    sendOk(res, req, { category });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const existing = await prisma.category.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Category not found');
    // Products keep their categoryId set null (onDelete: SetNull) — safe to delete.
    await prisma.category.delete({ where: { id: existing.id } });
    sendOk(res, req, { id: existing.id, deleted: true });
  }),
);

export default router;
