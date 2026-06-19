import { Router } from 'express';
import { z } from 'zod';
import { sendOk, sendCreated, sendList, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { parsePagination } from '../lib/cursor.js';
import {
  issueGiftCardFacade,
  listGiftCardsFacade,
  giftCardByCodeFacade,
  voidGiftCardFacade,
} from '../lib/giftcards-plugipay.js';

/*
 * /api/v1/gift-cards — issue + manage gift cards / store credit (behind
 * requireAuth). Redemption itself happens in the sell flow (a GIFT_CARD
 * payment whose `reference` is the code, see lib/sell.ts).
 *
 * Module-aware via the gift-card facade (lib/giftcards-plugipay.ts):
 *   - Payments module ON  → cards live in the merchant's Plugipay workspace
 *   - Payments module OFF → the LOCAL Prisma implementation (unchanged)
 * The route never branches on the flag; the facade switches and returns a
 * uniform row shape either way.
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
    const { rows, next, hasMore } = await listGiftCardsFacade({
      accountId,
      customerId: customerId ?? null,
      status: status ?? null,
      limit,
      cursor: cursor ? { createdAt: cursor.createdAt, id: cursor.id } : null,
    });
    sendList(res, req, rows, next, hasMore);
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
    const giftCard = await issueGiftCardFacade({
      accountId,
      amount: body.amount,
      customerId: body.customerId ?? null,
      code: body.code ?? null,
      note: body.note ?? null,
    });
    sendCreated(res, req, { giftCard });
  }),
);

router.get(
  '/:code',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const giftCard = await giftCardByCodeFacade(accountId, String(req.params.code));
    if (!giftCard) throw new ApiError(404, 'NOT_FOUND', 'Gift card not found');
    sendOk(res, req, { giftCard });
  }),
);

router.post(
  '/:id/void',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const id = String(req.params.id);
    const giftCard = await voidGiftCardFacade(accountId, id);
    sendOk(res, req, { giftCard });
  }),
);

export default router;
