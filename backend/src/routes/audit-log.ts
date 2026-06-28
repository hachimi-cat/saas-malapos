import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { sendList } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { parsePagination, encodeCursor } from '../lib/cursor.js';
import { rateLimit } from '../middleware/rate-limit.js';

/*
 * /api/v1/audit-log — read-only activity feed for the workspace
 * (behind requireAuth, account-scoped).
 *
 *   GET /            cursor-paginated list of the domain events this
 *                    workspace has emitted (sales, billing, …), newest
 *                    first. Optional ?type=malapos.sale.completed.v1
 *                    filters to a single event type.
 *
 * The feed is sourced from `outbox_events` — the same append-only event
 * store that drives webhook delivery (ADR-0006). It is surfaced verbatim
 * (no separate audit table to drift from reality); the signing secret and
 * other delivery internals never live here, so the projection is safe to
 * read. Events are immutable, so this router is GET-only.
 */

const router = Router();

router.get(
  '/',
  rateLimit('read'),
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { limit, cursor } = parsePagination(req.query);
    const type = (req.query.type as string | undefined)?.trim() || null;

    const rows = await prisma.outboxEvent.findMany({
      where: {
        accountId,
        ...(type ? { type } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        type: true,
        aggregateId: true,
        occurredAt: true,
        data: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const next =
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null;
    sendList(res, req, page, next, hasMore);
  }),
);

export default router;
