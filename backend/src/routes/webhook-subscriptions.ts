import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk, sendCreated, sendErr } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { generateWebhookSecret } from '../lib/webhook-signature.js';
import { rateLimit } from '../middleware/rate-limit.js';

/*
 * /api/v1/webhook-subscriptions — customer endpoints receiving
 * malapos.* events (delivered by services/outbox-worker.ts).
 *
 * The signing secret is returned ONCE on creation; list responses
 * never include it.
 */

const router = Router();

const SAFE_SELECT = {
  id: true,
  url: true,
  events: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** "*" or a versioned malapos event type (malapos.sale.completed.v1, …).
 *  Format-checked rather than catalog-checked so new event types don't
 *  require a portal redeploy to subscribe to. */
const eventPattern = z
  .string()
  .refine((s) => s === '*' || /^malapos\.[a-z_]+(\.[a-z_]+)*\.v\d+$/.test(s), {
    message: 'must be "*" or a versioned malapos event type',
  });

router.get(
  '/',
  rateLimit('read'),
  asyncHandler(async (req, res) => {
    const rows = await prisma.webhookSubscription.findMany({
      where: { accountId: req.auth!.accountId as string },
      orderBy: { createdAt: 'desc' },
      select: SAFE_SELECT,
    });
    sendOk(res, req, { subscriptions: rows });
  }),
);

const createBody = z.object({
  url: z.string().trim().url().max(2000).startsWith('http'),
  events: z.array(eventPattern).min(1).max(20).optional(),
});

router.post(
  '/',
  rateLimit('mutating_light'),
  asyncHandler(async (req, res) => {
    const input = createBody.parse(req.body);
    const secret = generateWebhookSecret();
    const row = await prisma.webhookSubscription.create({
      data: {
        id: newId('whs'),
        accountId: req.auth!.accountId as string,
        url: input.url,
        secret,
        events: input.events ?? ['*'],
      },
      select: SAFE_SELECT,
    });
    // The signing secret is returned ONCE here and never again.
    sendCreated(res, req, { ...row, secret });
  }),
);

const patchBody = z.object({
  active: z.boolean(),
});

router.patch(
  '/:id',
  rateLimit('mutating_light'),
  asyncHandler(async (req, res) => {
    const input = patchBody.parse(req.body);
    const accountId = req.auth!.accountId as string;
    const existing = await prisma.webhookSubscription.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!existing) return sendErr(res, req, 404, 'NOT_FOUND', 'webhook subscription not found');
    const row = await prisma.webhookSubscription.update({
      where: { id: existing.id },
      data: { active: input.active },
      select: SAFE_SELECT,
    });
    sendOk(res, req, row);
  }),
);

router.delete(
  '/:id',
  rateLimit('mutating_light'),
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const existing = await prisma.webhookSubscription.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!existing) return sendErr(res, req, 404, 'NOT_FOUND', 'webhook subscription not found');
    await prisma.webhookSubscription.delete({ where: { id: existing.id } });
    sendOk(res, req, { deleted: true });
  }),
);

export default router;
