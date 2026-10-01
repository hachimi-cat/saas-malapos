import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk, sendCreated, sendErr, sendList } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { encodeCursor, decodeCursor } from '../lib/cursor.js';
import { generateWebhookSecret } from '../lib/webhook-signature.js';
import { assertSafeWebhookUrl, BlockedTargetError } from '../lib/webhook-target.js';
import { EVENT_TYPES } from '../lib/event-types.js';
import { failPendingDeliveries, retryWebhookDelivery } from '../services/webhook-delivery.js';
import { rateLimit } from '../middleware/rate-limit.js';

/*
 * /api/v1/webhook-subscriptions — customer endpoints receiving malapos.*
 * events, and the log of what was delivered to them. Deliveries are sent,
 * retried and recorded by services/webhook-delivery.ts.
 *
 * The signing secret is returned ONCE on creation; list responses never
 * include it.
 */

const router = Router();

const SAFE_SELECT = {
  id: true,
  url: true,
  events: true,
  active: true,
  consecutiveFailures: true,
  failingSince: true,
  disabledAt: true,
  disabledReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** A delivery as the API shows it, with every attempt made at it (oldest
 *  first). `body` is the exact JSON sent on every attempt. */
const DELIVERY_SELECT = {
  id: true,
  subscriptionId: true,
  eventId: true,
  type: true,
  body: true,
  status: true,
  attempts: true,
  nextRetryAt: true,
  lastAttemptAt: true,
  deliveredAt: true,
  responseCode: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
  attemptLog: {
    orderBy: { attemptNumber: 'asc' },
    select: {
      attemptNumber: true,
      status: true,
      responseCode: true,
      durationMs: true,
      error: true,
      nextRetryAt: true,
      attemptedAt: true,
    },
  },
} as const satisfies Prisma.WebhookDeliverySelect;

/** "*", a versioned malapos event type (malapos.sale.completed.v1, …) or a
 *  prefix ending in "*" (malapos.kds.*). Format-checked rather than
 *  catalog-checked so new event types don't require a portal redeploy to
 *  subscribe to. */
const eventPattern = z
  .string()
  .refine(
    (s) => s === '*' || /^malapos\.[a-z_]+(\.[a-z_]+)*\.v\d+$/.test(s) || /^malapos\.([a-z_]+\.)*\*$/.test(s),
    { message: 'must be "*", a versioned malapos event type, or a prefix like "malapos.kds.*"' },
  );

/** The SSRF guard (lib/webhook-target.ts) as a message the caller can act
 *  on, or null when the URL may be called. */
async function urlRefusal(url: string): Promise<string | null> {
  try {
    await assertSafeWebhookUrl(url);
    return null;
  } catch (e) {
    if (e instanceof BlockedTargetError) return e.message;
    throw e;
  }
}

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

/** The event types a subscription can name: every malapos.*.v1 type Malapos
 *  sends, with what it means. */
router.get(
  '/event-types',
  rateLimit('read'),
  asyncHandler(async (req, res) => {
    sendOk(res, req, { types: EVENT_TYPES });
  }),
);

const createBody = z.object({
  url: z.string().trim().url().max(2000).startsWith('http'),
  events: z.array(eventPattern).min(1).max(20).optional(),
});

/** Add an endpoint. The URL must be https (in production) and must not point
 *  at a private, loopback or link-local address. */
router.post(
  '/',
  rateLimit('mutating_light'),
  asyncHandler(async (req, res) => {
    const input = createBody.parse(req.body);
    const refusal = await urlRefusal(input.url);
    if (refusal) return sendErr(res, req, 400, 'VALIDATION_ERROR', `url: ${refusal}`, { param: 'url' });
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

const listDeliveriesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
  subscriptionId: z.string().min(1).optional(),
  status: z.enum(['pending', 'succeeded', 'failed']).optional(),
  type: z.string().min(1).optional(),
});

/**
 * List webhook deliveries. Newest first: one row per event per endpoint, with
 * its status (pending, succeeded, failed), attempt count, next retry, the body
 * sent and every attempt made (`attemptLog`). Filter by `subscriptionId`,
 * `status` or `type`; page with `limit` (1-100, default 20) and `meta.cursor`
 * while `meta.hasMore`.
 */
router.get(
  '/deliveries',
  rateLimit('read'),
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { limit, cursor: rawCursor, subscriptionId, status, type } = listDeliveriesQuery.parse(req.query);
    const and: Prisma.WebhookDeliveryWhereInput[] = [{ accountId }];
    if (subscriptionId) and.push({ subscriptionId });
    if (status) and.push({ status });
    if (type) and.push({ type });
    // After the cursor's row in (createdAt, id) order, so a page boundary
    // between rows made in the same millisecond skips none.
    const cursor = decodeCursor(rawCursor);
    if (cursor) {
      const d = new Date(cursor.createdAt);
      if (!Number.isNaN(d.getTime())) and.push({ OR: [{ createdAt: { lt: d } }, { createdAt: d, id: { lt: cursor.id } }] });
    }
    const rows = await prisma.webhookDelivery.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: DELIVERY_SELECT,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const hasMore = rows.length > limit;
    sendList(res, req, page, hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null, hasMore);
  }),
);

/** Get a webhook delivery, with every attempt made at it. */
router.get(
  '/deliveries/:id',
  rateLimit('read'),
  asyncHandler(async (req, res) => {
    const row = await prisma.webhookDelivery.findFirst({
      where: { id: String(req.params.id), accountId: req.auth!.accountId as string },
      select: DELIVERY_SELECT,
    });
    if (!row) return sendErr(res, req, 404, 'NOT_FOUND', 'webhook delivery not found');
    sendOk(res, req, row);
  }),
);

/**
 * Retry a webhook delivery. Queues one more attempt now at a failed delivery
 * (or sends a succeeded one again); it goes out within seconds — read it back
 * with GET /webhook-subscriptions/deliveries/:id. 202 with the delivery
 * `pending`; 409 ALREADY_QUEUED when it is pending already, 409
 * ENDPOINT_DISABLED when its endpoint is off.
 */
router.post(
  '/deliveries/:id/retry',
  rateLimit('mutating_light'),
  asyncHandler(async (req, res) => {
    const out = await retryWebhookDelivery(req.auth!.accountId as string, String(req.params.id));
    if (!out.ok) return sendErr(res, req, out.code === 'NOT_FOUND' ? 404 : 409, out.code, out.message);
    const row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: out.id }, select: DELIVERY_SELECT });
    sendOk(res, req, row, 202);
  }),
);

const patchBody = z
  .object({
    active: z.boolean().optional(),
    url: z.string().trim().url().max(2000).startsWith('http').optional(),
    events: z.array(eventPattern).min(1).max(20).optional(),
  })
  .refine((b) => b.active !== undefined || b.url !== undefined || b.events !== undefined, {
    message: 'nothing to change: pass active, url or events',
  });

/**
 * Update an endpoint. `active: false` pauses it (its queued deliveries become
 * failed); `active: true` re-enables it — also after Malapos switched it off
 * for failing — and clears its failure streak. A new `url` goes through the
 * same checks as on create; the signing secret stays the same.
 */
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
    if (input.url !== undefined && input.url !== existing.url) {
      const refusal = await urlRefusal(input.url);
      if (refusal) return sendErr(res, req, 400, 'VALIDATION_ERROR', `url: ${refusal}`, { param: 'url' });
    }
    const data: Prisma.WebhookSubscriptionUpdateInput = {
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.events !== undefined ? { events: input.events } : {}),
      ...(input.active === true
        ? { consecutiveFailures: 0, failingSince: null, disabledAt: null, disabledReason: null }
        : {}),
    };
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.webhookSubscription.update({ where: { id: existing.id }, data, select: SAFE_SELECT });
      if (input.active === false && existing.active) await failPendingDeliveries(tx, existing.id, 'endpoint is disabled');
      return updated;
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
