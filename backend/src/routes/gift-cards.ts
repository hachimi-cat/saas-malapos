import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk, sendCreated, sendList, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { parsePagination, encodeCursor } from '../lib/cursor.js';
import { issueGiftCard, giftCardByCode } from '../lib/giftcards.js';

/*
 * /api/v1/gift-cards — issue + manage gift cards / store credit (behind
 * requireAuth). Redemption itself happens in the sell flow (a GIFT_CARD
 * payment whose `reference` is the code, see lib/sell.ts + lib/giftcards.ts).
 *
 *   GET    /          list (cursor); ?customerId= ?status=
 *   POST   /          issue a new gift card / store credit
 *   GET    /:code     look up a card by its code (balance + status)
 *   POST   /:id/void  cancel a card (writes off the remaining balance)
 */

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { customerId, status } = req.query as Record<string, string | undefined>;
    const { limit, cursor } = parsePagination(req.query);
    const rows = await prisma.giftCard.findMany({
      where: {
        accountId,
        ...(customerId ? { customerId } : {}),
        ...(status ? { status: status as never } : {}),
        ...(cursor
          ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const next = hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
    sendList(res, req, page, next, hasMore);
  }),
);

const issueBody = z.object({
  amount: z.number().int().positive(),
  customerId: z.string().trim().nullish(),
  code: z.string().trim().max(60).nullish(),
  note: z.string().trim().max(300).nullish(),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = issueBody.parse(req.body);
    const id = await issueGiftCard({
      accountId,
      amount: body.amount,
      customerId: body.customerId ?? null,
      code: body.code ?? null,
      note: body.note ?? null,
    });
    const giftCard = await prisma.giftCard.findUnique({ where: { id } });
    sendCreated(res, req, { giftCard });
  }),
);

router.get(
  '/:code',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const giftCard = await giftCardByCode(accountId, String(req.params.code));
    if (!giftCard) throw new ApiError(404, 'NOT_FOUND', 'Gift card not found');
    sendOk(res, req, { giftCard });
  }),
);

router.post(
  '/:id/void',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const id = String(req.params.id);
    const card = await prisma.giftCard.findFirst({ where: { id, accountId } });
    if (!card) throw new ApiError(404, 'NOT_FOUND', 'Gift card not found');
    if (card.status === 'VOID') {
      sendOk(res, req, { giftCard: card });
      return;
    }
    const giftCard = await prisma.$transaction(async (tx) => {
      // Write off any remaining balance through the ledger, then void.
      if (card.balance !== 0) {
        await tx.giftCardEntry.create({
          data: {
            id: newId('gce'),
            accountId,
            giftCardId: card.id,
            delta: -card.balance,
            reason: 'void',
          },
        });
      }
      return tx.giftCard.update({
        where: { id: card.id },
        data: { balance: 0, status: 'VOID' },
      });
    });
    sendOk(res, req, { giftCard });
  }),
);

export default router;
