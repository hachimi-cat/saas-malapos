import { Router } from 'express';
import type { KdsState } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { sendOk, sendList, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { writeOutbox } from '../lib/outbox.js';

/*
 * /api/v1/kds — Kitchen Display System for F&B (behind requireAuth).
 *
 * A ticket is any transaction with a non-null kdsState (set to NEW at sale/
 * park time for FNB workspaces, see lib/sell.ts). The board shows active
 * tickets (NEW/PREPARING/READY) oldest-first; advancing SERVED drops it off.
 *
 *   GET   /              active tickets (NEW/PREPARING/READY) + items
 *   POST  /:id/advance   NEW → PREPARING → READY → SERVED
 */

const router = Router();

const ORDER: KdsState[] = ['NEW', 'PREPARING', 'READY', 'SERVED'];
const ACTIVE: KdsState[] = ['NEW', 'PREPARING', 'READY'];

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { outletId } = req.query as Record<string, string | undefined>;
    const rows = await prisma.transaction.findMany({
      where: {
        accountId,
        kdsState: { in: ACTIVE },
        ...(outletId ? { outletId } : {}),
      },
      include: {
        items: {
          select: { id: true, productName: true, variantName: true, quantity: true, modifiers: true },
        },
        outlet: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    sendList(res, req, rows, null, false);
  }),
);

router.post(
  '/:id/advance',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const ticket = await prisma.transaction.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found');
    if (ticket.kdsState == null) throw new ApiError(409, 'CONFLICT', 'Not a kitchen ticket');

    const idx = ORDER.indexOf(ticket.kdsState);
    if (idx < 0 || idx >= ORDER.length - 1) {
      throw new ApiError(409, 'CONFLICT', 'Ticket is already served');
    }
    const next = ORDER[idx + 1]!;

    const sale = await prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id: ticket.id },
        data: { kdsState: next },
      });
      await writeOutbox(tx, {
        type: 'malapos.kds.advanced.v1',
        accountId,
        aggregateId: ticket.id,
        data: { transactionId: ticket.id, from: ticket.kdsState, to: next },
      });
      return updated;
    });

    sendOk(res, req, { ticket: { id: sale.id, number: sale.number, kdsState: sale.kdsState } });
  }),
);

export default router;
