import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk, sendCreated, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';

/*
 * /api/v1/modifiers — F&B modifier groups (e.g. "Sugar level", "Extra shot")
 * and their modifiers, plus attaching groups to products (behind requireAuth).
 *
 *   GET    /                       list groups (with modifiers)
 *   POST   /                       create group + nested modifiers
 *   GET    /:id                    one group with modifiers
 *   PATCH  /:id                    update group fields
 *   DELETE /:id                    delete group (modifiers + links cascade)
 *   POST   /:id/items              add a modifier to the group
 *   PATCH  /:id/items/:modId       update a modifier
 *   DELETE /:id/items/:modId       delete a modifier
 *   GET    /product/:productId     groups attached to a product (with modifiers)
 *   PUT    /product/:productId     replace a product's attached groups
 */

const router = Router();

const withModifiers = {
  modifiers: { orderBy: { sortOrder: 'asc' } },
} as const;

const modifierInput = z.object({
  name: z.string().trim().min(1).max(80),
  price: z.number().int().min(0).optional().default(0),
  sortOrder: z.number().int().min(0).optional(),
});

const groupCreate = z.object({
  name: z.string().trim().min(1).max(80),
  minSelect: z.number().int().min(0).optional().default(0),
  maxSelect: z.number().int().min(1).optional().default(1),
  sortOrder: z.number().int().min(0).optional().default(0),
  modifiers: z.array(modifierInput).optional().default([]),
});

const groupPatch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  minSelect: z.number().int().min(0).optional(),
  maxSelect: z.number().int().min(1).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const modifierPatch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  price: z.number().int().min(0).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const attachInput = z.object({
  groupIds: z.array(z.string()),
});

// ── Modifier groups ──

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const groups = await prisma.modifierGroup.findMany({
      where: { accountId },
      include: withModifiers,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    sendOk(res, req, { groups });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const input = groupCreate.parse(req.body);
    const group = await prisma.modifierGroup.create({
      data: {
        id: newId('mdg'),
        accountId,
        name: input.name,
        minSelect: input.minSelect,
        maxSelect: input.maxSelect,
        sortOrder: input.sortOrder,
        modifiers: {
          create: input.modifiers.map((m, i) => ({
            id: newId('mod'),
            accountId,
            name: m.name,
            price: m.price,
            sortOrder: m.sortOrder ?? i,
          })),
        },
      },
      include: withModifiers,
    });
    sendCreated(res, req, { group });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const group = await prisma.modifierGroup.findFirst({
      where: { id: String(req.params.id), accountId },
      include: withModifiers,
    });
    if (!group) throw new ApiError(404, 'NOT_FOUND', 'Modifier group not found');
    sendOk(res, req, { group });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const data = groupPatch.parse(req.body);
    const existing = await prisma.modifierGroup.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Modifier group not found');
    const group = await prisma.modifierGroup.update({
      where: { id: existing.id },
      data,
      include: withModifiers,
    });
    sendOk(res, req, { group });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const existing = await prisma.modifierGroup.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Modifier group not found');
    // Modifiers + ProductModifierGroup links cascade (onDelete: Cascade).
    await prisma.modifierGroup.delete({ where: { id: existing.id } });
    sendOk(res, req, { id: existing.id, deleted: true });
  }),
);

// ── Modifiers (items within a group) ──

router.post(
  '/:id/items',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const group = await prisma.modifierGroup.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!group) throw new ApiError(404, 'NOT_FOUND', 'Modifier group not found');
    const m = modifierInput.parse(req.body);
    const modifier = await prisma.modifier.create({
      data: {
        id: newId('mod'),
        accountId,
        groupId: group.id,
        name: m.name,
        price: m.price,
        sortOrder: m.sortOrder ?? 0,
      },
    });
    sendCreated(res, req, { modifier });
  }),
);

router.patch(
  '/:id/items/:modId',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const data = modifierPatch.parse(req.body);
    const modifier = await prisma.modifier.findFirst({
      where: { id: String(req.params.modId), groupId: String(req.params.id), accountId },
    });
    if (!modifier) throw new ApiError(404, 'NOT_FOUND', 'Modifier not found');
    const updated = await prisma.modifier.update({
      where: { id: modifier.id },
      data,
    });
    sendOk(res, req, { modifier: updated });
  }),
);

router.delete(
  '/:id/items/:modId',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const modifier = await prisma.modifier.findFirst({
      where: { id: String(req.params.modId), groupId: String(req.params.id), accountId },
    });
    if (!modifier) throw new ApiError(404, 'NOT_FOUND', 'Modifier not found');
    await prisma.modifier.delete({ where: { id: modifier.id } });
    sendOk(res, req, { id: modifier.id, deleted: true });
  }),
);

// ── Product attachments (ProductModifierGroup join) ──

router.get(
  '/product/:productId',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const product = await prisma.product.findFirst({
      where: { id: String(req.params.productId), accountId },
    });
    if (!product) throw new ApiError(404, 'NOT_FOUND', 'Product not found');
    const links = await prisma.productModifierGroup.findMany({
      where: { productId: product.id },
      include: { group: { include: withModifiers } },
      orderBy: { sortOrder: 'asc' },
    });
    const groups = links.map((l) => l.group);
    sendOk(res, req, { groups });
  }),
);

router.put(
  '/product/:productId',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { groupIds } = attachInput.parse(req.body);
    const product = await prisma.product.findFirst({
      where: { id: String(req.params.productId), accountId },
    });
    if (!product) throw new ApiError(404, 'NOT_FOUND', 'Product not found');

    // Verify every group belongs to this account.
    const found = await prisma.modifierGroup.findMany({
      where: { id: { in: groupIds }, accountId },
      select: { id: true },
    });
    if (found.length !== new Set(groupIds).size) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'One or more modifier groups not found');
    }

    await prisma.$transaction([
      prisma.productModifierGroup.deleteMany({ where: { productId: product.id } }),
      prisma.productModifierGroup.createMany({
        data: groupIds.map((groupId, i) => ({ productId: product.id, groupId, sortOrder: i })),
      }),
    ]);

    const links = await prisma.productModifierGroup.findMany({
      where: { productId: product.id },
      include: { group: { include: withModifiers } },
      orderBy: { sortOrder: 'asc' },
    });
    const groups = links.map((l) => l.group);
    sendOk(res, req, { groups });
  }),
);

export default router;
