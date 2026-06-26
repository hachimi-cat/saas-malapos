import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';

/*
 * /api/v1/settings — the workspace PosSettings (one row per accountId,
 * behind requireAuth). Holds the business profile that drives sell-screen
 * affordances (businessType) and currency.
 *
 *   GET /   fetch (auto-creating a default row the first time)
 *   PUT /   upsert the business profile
 */

const router = Router();

const updateBody = z.object({
  businessName: z.string().trim().max(120).nullish(),
  businessType: z.enum(['RETAIL', 'FNB', 'PHARMACY', 'GENERAL']).optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  // Store bank account shown to a customer paying by TRANSFER (distinct from
  // the Plugipay payout account). Empty string clears the field.
  transferBankName: z.string().trim().max(120).nullish(),
  transferBankAccountNumber: z.string().trim().max(60).nullish(),
  transferBankAccountHolder: z.string().trim().max(120).nullish(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    let settings = await prisma.posSettings.findUnique({ where: { accountId } });
    if (!settings) {
      settings = await prisma.posSettings.create({
        data: { id: newId('pos'), accountId, businessType: 'GENERAL', currency: 'IDR' },
      });
    }
    sendOk(res, req, { settings });
  }),
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const body = updateBody.parse(req.body);
    const settings = await prisma.posSettings.upsert({
      where: { accountId },
      update: body,
      create: {
        id: newId('pos'),
        accountId,
        businessType: 'GENERAL',
        currency: 'IDR',
        ...body,
      },
    });
    sendOk(res, req, { settings });
  }),
);

export default router;
