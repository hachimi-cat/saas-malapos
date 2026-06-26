import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk, sendCreated, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';

/*
 * /api/v1/floors — F&B floors / levels within an outlet (behind requireAuth,
 * account-scoped). A floor groups tables onto its own layout canvas, so an
 * outlet can run a Ground Floor / First Floor / Rooftop each with its own map.
 * An outlet with tables always has at least one floor ("Main floor", seeded by
 * the floors migration backfill); table create/update default to the outlet's
 * first floor so a table always lands somewhere.
 *
 *   GET    /?outletId=   list floors for an outlet
 *   POST   /             create a floor
 *   PATCH  /:id          rename / reorder a floor
 *   DELETE /:id          delete (409 if the floor still has tables)
 */

const router = Router();

const createBody = z.object({
  outletId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(60),
  sortOrder: z.number().int().min(0).optional(),
});

const patchBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

/** Confirm the outlet belongs to this account (floors are outlet-scoped). */
async function assertOutlet(accountId: string, outletId: string): Promise<void> {
  const outlet = await prisma.outlet.findFirst({ where: { id: outletId, accountId }, select: { id: true } });
  if (!outlet) throw new ApiError(404, 'NOT_FOUND', 'Outlet not found');
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const outletId = (req.query.outletId as string | undefined)?.trim();
    if (!outletId) throw new ApiError(400, 'VALIDATION_ERROR', 'outletId is required', 'outletId');
    const floors = await prisma.floor.findMany({
      where: { accountId, outletId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    sendOk(res, req, { floors });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = createBody.parse(req.body);
    await assertOutlet(accountId, body.outletId);
    const dupe = await prisma.floor.findFirst({
      where: { outletId: body.outletId, name: body.name },
      select: { id: true },
    });
    if (dupe) throw new ApiError(409, 'CONFLICT', `A floor named "${body.name}" already exists at this outlet`);
    const floor = await prisma.floor.create({
      data: {
        id: newId('flr'),
        accountId,
        outletId: body.outletId,
        name: body.name,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    sendCreated(res, req, { floor });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = patchBody.parse(req.body);
    const existing = await prisma.floor.findFirst({ where: { id: String(req.params.id), accountId } });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Floor not found');
    if (body.name && body.name !== existing.name) {
      const dupe = await prisma.floor.findFirst({
        where: { outletId: existing.outletId, name: body.name, id: { not: existing.id } },
        select: { id: true },
      });
      if (dupe) throw new ApiError(409, 'CONFLICT', `A floor named "${body.name}" already exists at this outlet`);
    }
    const floor = await prisma.floor.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
    });
    sendOk(res, req, { floor });
  }),
);

/**
 * DELETE /:id — remove a floor. Safe: a floor that still has ANY table
 * (active or inactive) blocks with 409, so a table is never orphaned. Move or
 * delete the floor's tables first.
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const existing = await prisma.floor.findFirst({ where: { id: String(req.params.id), accountId } });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Floor not found');
    const tables = await prisma.table.count({ where: { floorId: existing.id } });
    if (tables > 0) {
      throw new ApiError(
        409,
        'CONFLICT',
        `This floor still has ${tables} table${tables === 1 ? '' : 's'}. Move or delete them before deleting the floor.`,
      );
    }
    await prisma.floor.delete({ where: { id: existing.id } });
    sendOk(res, req, { id: existing.id, deleted: true });
  }),
);

export default router;
