import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk, sendCreated, sendList, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { parsePagination, encodeCursor } from '../lib/cursor.js';
import { closeShiftReconciliation } from '../lib/shifts.js';

/*
 * /api/v1/shifts — cashier shifts + cash reconciliation (behind requireAuth).
 *
 *   GET    /current?outletId=   the caller's currently OPEN shift at an outlet
 *   POST   /open                open a shift (one OPEN per cashier per outlet)
 *   POST   /:id/close           close + reconcile (counted vs expected cash)
 *   GET    /                    list (cursor-paginated); ?outletId= ?status=
 *   GET    /:id                 shift detail + sales/cash summary
 *
 * Cursor pagination orders by openedAt desc / id desc — the cursor's
 * `createdAt` slot carries the shift's openedAt ISO string.
 */

const router = Router();

const openBody = z.object({
  outletId: z.string().trim(),
  openingFloat: z.number().int().min(0),
});

const closeBody = z.object({
  countedCash: z.number().int().min(0),
  notes: z.string().trim().max(1000).nullish(),
});

router.get(
  '/current',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const cashierSub = req.auth!.sub as string | undefined;
    const { outletId } = req.query as Record<string, string | undefined>;
    if (!outletId) throw new ApiError(422, 'VALIDATION_ERROR', 'outletId is required', 'outletId');
    const shift = await prisma.shift.findFirst({
      where: { accountId, outletId, cashierSub, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });
    sendOk(res, req, { shift: shift ?? null });
  }),
);

router.post(
  '/open',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const cashierSub = req.auth!.sub as string | undefined;
    const cashierName = (req.auth!.name as string | undefined) ?? null;
    const body = openBody.parse(req.body);

    const existing = await prisma.shift.findFirst({
      where: { accountId, outletId: body.outletId, cashierSub, status: 'OPEN' },
    });
    if (existing) {
      throw new ApiError(409, 'CONFLICT', 'You already have an open shift at this outlet');
    }

    const shift = await prisma.shift.create({
      data: {
        id: newId('shf'),
        accountId,
        outletId: body.outletId,
        cashierSub: cashierSub ?? '',
        cashierName,
        status: 'OPEN',
        openingFloat: body.openingFloat,
        openedAt: new Date(),
      },
    });
    sendCreated(res, req, { shift });
  }),
);

router.post(
  '/:id/close',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = closeBody.parse(req.body);

    const shift = await prisma.shift.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!shift) throw new ApiError(404, 'NOT_FOUND', 'Shift not found');
    if (shift.status !== 'OPEN') throw new ApiError(409, 'CONFLICT', 'Shift is not open');

    const { expectedCash } = await closeShiftReconciliation(accountId, shift.id, shift.openingFloat);
    const cashDifference = body.countedCash - expectedCash;

    const updated = await prisma.shift.update({
      where: { id: shift.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        expectedCash,
        countedCash: body.countedCash,
        cashDifference,
        notes: body.notes ?? null,
      },
    });
    sendOk(res, req, { shift: updated });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { outletId, status } = req.query as Record<string, string | undefined>;
    const { limit, cursor } = parsePagination(req.query);
    const rows = await prisma.shift.findMany({
      where: {
        accountId,
        ...(outletId ? { outletId } : {}),
        ...(status ? { status: status as never } : {}),
        ...(cursor
          ? {
              OR: [
                { openedAt: { lt: new Date(cursor.createdAt) } },
                { openedAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const next = hasMore && last ? encodeCursor({ createdAt: last.openedAt.toISOString(), id: last.id }) : null;
    sendList(res, req, page, next, hasMore);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const shift = await prisma.shift.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!shift) throw new ApiError(404, 'NOT_FOUND', 'Shift not found');

    const txns = await prisma.transaction.findMany({
      where: { accountId, shiftId: shift.id, status: 'COMPLETED' },
      select: { total: true },
    });
    const salesCount = txns.length;
    const grossTotal = txns.reduce((acc, t) => acc + t.total, 0);

    const byMethodRows = await prisma.payment.groupBy({
      by: ['method'],
      where: {
        accountId,
        status: 'PAID',
        transaction: { shiftId: shift.id, status: 'COMPLETED' },
      },
      _sum: { amount: true },
    });
    const byMethod = byMethodRows.map((r) => ({ method: r.method, total: r._sum.amount ?? 0 }));

    const expectedCash =
      shift.status === 'OPEN'
        ? (await closeShiftReconciliation(accountId, shift.id, shift.openingFloat)).expectedCash
        : shift.expectedCash;

    sendOk(res, req, {
      shift,
      summary: { salesCount, grossTotal, byMethod, expectedCash },
    });
  }),
);

export default router;
