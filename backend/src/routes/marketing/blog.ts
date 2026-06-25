/*
 * Marketing → Storefront blog posts. Thin proxy to Ripllo via the gated
 * per-merchant client (requireRipploClient → 409 when the Marketing
 * module is off). Malapos port of storlaunch's account-blog.ts; the
 * tier-limit middleware is dropped (Malapos doesn't gate blog count).
 *
 * Mounted at /api/v1/account/blog/posts (requireAuth at the mount).
 * Returns Ripllo's SDK shapes verbatim ({ posts }, { post }, …) so the
 * frontend blogApi client matches storlaunch 1:1.
 */
import { Router } from 'express';
import { z } from 'zod';
import { sendOk, sendCreated, sendErr } from '../../lib/http.js';
import { h as asyncHandler } from '../../lib/async-handler.js';
import { requireRipploClient, handleRipploError } from '../../services/ripllo-proxy.js';

const router = Router();

const blogStatuses = ['draft', 'published'] as const;
type BlogStatus = (typeof blogStatuses)[number];

const tagsSchema = z.array(z.string().max(50)).max(20);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().max(160).optional(),
  excerpt: z.string().max(500).optional().nullable(),
  body: z.string().min(1).max(200_000),
  coverImage: z.string().url().max(1000).optional().nullable(),
  status: z.enum(blogStatuses).optional(),
  publishedAt: z.string().datetime().optional().nullable(),
  authorName: z.string().max(100).optional().nullable(),
  tags: tagsSchema.optional(),
  metaTitle: z.string().max(200).optional().nullable(),
  metaDescription: z.string().max(500).optional().nullable(),
  marketingCampaignId: z.string().nullable().optional(),
});

const updateSchema = createSchema.partial();

const listSchema = z.object({
  status: z.enum(blogStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const { status } = listSchema.parse(req.query);
      const client = await requireRipploClient(req.auth!.accountId as string);
      const result = await client.blog.list({ status });
      return sendOk(res, req, result);
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireRipploClient(req.auth!.accountId as string);
      const post = await client.blog.get(String(req.params.id));
      return sendOk(res, req, post);
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    try {
      const body = createSchema.parse(req.body ?? {});
      const client = await requireRipploClient(req.auth!.accountId as string);
      const slug = body.slug ?? slugify(body.title);
      const post = await client.blog.create({ ...body, slug });
      return sendCreated(res, req, post);
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res, next) => {
    try {
      const body = updateSchema.parse(req.body ?? {});
      const client = await requireRipploClient(req.auth!.accountId as string);
      const post = await client.blog.update(String(req.params.id), body);
      return sendOk(res, req, post);
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireRipploClient(req.auth!.accountId as string);
      await client.blog.delete(String(req.params.id));
      return sendOk(res, req, { deleted: true });
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

router.post(
  '/:id/publish',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireRipploClient(req.auth!.accountId as string);
      const existing = await client.blog.get(String(req.params.id));
      if (existing.post.status === 'published') {
        return sendErr(res, req, 400, 'ALREADY_PUBLISHED', 'Post is already published');
      }
      const post = await client.blog.update(String(req.params.id), {
        status: 'published' as BlogStatus,
      });
      return sendOk(res, req, post);
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

router.post(
  '/:id/unpublish',
  asyncHandler(async (req, res, next) => {
    try {
      const client = await requireRipploClient(req.auth!.accountId as string);
      const post = await client.blog.update(String(req.params.id), {
        status: 'draft' as BlogStatus,
      });
      return sendOk(res, req, post);
    } catch (err) {
      return handleRipploError(res, req, err, next);
    }
  }),
);

export default router;
