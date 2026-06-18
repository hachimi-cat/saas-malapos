import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk, sendCreated, sendErr } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { generateApiKey } from '../lib/api-keys.js';
import { rateLimit } from '../middleware/rate-limit.js';

/*
 * /api/v1/api-keys — manage programmatic access keys (behind
 * requireAuth; session callers manage keys, the keys themselves
 * authenticate API callers via middleware/auth.ts Path 1).
 *
 * Hashes never leave the database: list/create responses expose only
 * the display-safe keyPrefix. The plaintext is returned ONCE, on
 * creation.
 */

const router = Router();

const SAFE_SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

router.get(
  '/',
  rateLimit('read'),
  asyncHandler(async (req, res) => {
    const rows = await prisma.apiKey.findMany({
      where: { accountId: req.auth!.accountId as string },
      orderBy: { createdAt: 'desc' },
      select: SAFE_SELECT,
    });
    sendOk(res, req, { apiKeys: rows });
  }),
);

const createBody = z.object({
  name: z.string().trim().min(1).max(120),
});

router.post(
  '/',
  rateLimit('mutating_light'),
  asyncHandler(async (req, res) => {
    const input = createBody.parse(req.body);
    const { plaintext, keyPrefix, keyHash } = generateApiKey();
    const row = await prisma.apiKey.create({
      data: {
        id: newId('ak'),
        accountId: req.auth!.accountId as string,
        name: input.name,
        keyPrefix,
        keyHash,
      },
      select: SAFE_SELECT,
    });
    // The plaintext key is returned ONCE here and never again.
    sendCreated(res, req, { ...row, key: plaintext });
  }),
);

router.delete(
  '/:id',
  rateLimit('mutating_light'),
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const existing = await prisma.apiKey.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!existing) return sendErr(res, req, 404, 'NOT_FOUND', 'API key not found');
    await prisma.apiKey.delete({ where: { id: existing.id } });
    sendOk(res, req, { deleted: true });
  }),
);

export default router;
