import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { sendOk, sendCreated, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { productCreate, productPatch, variantInput } from '../lib/catalog.js';
import { enforceLimit } from '../lib/entitlements.js';

/*
 * /api/v1/products — the catalog (behind requireAuth).
 *
 *   GET    /                 list (with variants); ?categoryId= ?active= ?q=
 *   GET    /lookup?barcode=  sell-screen scan / search (barcode exact, else q)
 *   POST   /                 create product + variants
 *   GET    /:id
 *   PATCH  /:id              product fields
 *   DELETE /:id              hard delete if unsold, else deactivate
 *   POST   /:id/variants     add a variant
 *   PATCH  /:id/variants/:vid
 *   DELETE /:id/variants/:vid  (deactivate if it has sales)
 */

const router = Router();

const withVariants = {
  variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
} as const;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { categoryId, active, q } = req.query as Record<string, string | undefined>;
    const products = await prisma.product.findMany({
      where: {
        accountId,
        ...(categoryId ? { categoryId } : {}),
        ...(active === 'true' ? { isActive: true } : active === 'false' ? { isActive: false } : {}),
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      include: { variants: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    sendOk(res, req, { products });
  }),
);

/** Sell-screen lookup: exact barcode match first, else fuzzy name/sku. */
router.get(
  '/lookup',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { barcode, q } = req.query as Record<string, string | undefined>;
    if (barcode) {
      const variant = await prisma.productVariant.findFirst({
        where: { accountId, barcode, isActive: true },
        include: { product: true },
      });
      return sendOk(res, req, { variant });
    }
    const term = (q ?? '').trim();
    if (!term) return sendOk(res, req, { products: [] });
    const products = await prisma.product.findMany({
      where: {
        accountId,
        isActive: true,
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { variants: { some: { sku: { contains: term, mode: 'insensitive' } } } },
        ],
      },
      include: withVariants,
      take: 20,
      orderBy: { name: 'asc' },
    });
    sendOk(res, req, { products });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const input = productCreate.parse(req.body);
    const kind = input.kind ?? 'GOODS';
    const existing = await prisma.product.count({ where: { accountId } });
    await enforceLimit(accountId, 'productLimit', existing);
    const product = await prisma.product.create({
      data: {
        id: newId('prd'),
        accountId,
        name: input.name,
        description: input.description ?? null,
        categoryId: input.categoryId ?? null,
        kind,
        // Services never track stock; goods default to tracked.
        trackStock: input.trackStock ?? kind === 'GOODS',
        requiresBatch: input.requiresBatch ?? false,
        imageUrl: input.imageUrl ?? null,
        isActive: input.isActive ?? true,
        variants: {
          create: input.variants.map((v, i) => ({
            id: newId('var'),
            accountId,
            name: v.name ?? 'Default',
            sku: v.sku ?? null,
            barcode: v.barcode ?? null,
            price: v.price,
            cost: v.cost ?? 0,
            sortOrder: v.sortOrder ?? i,
          })),
        },
      },
      include: { variants: { orderBy: { sortOrder: 'asc' } } },
    });
    sendCreated(res, req, { product });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const product = await prisma.product.findFirst({
      where: { id: String(req.params.id), accountId },
      include: { variants: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!product) throw new ApiError(404, 'NOT_FOUND', 'Product not found');
    sendOk(res, req, { product });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const data = productPatch.parse(req.body);
    const existing = await prisma.product.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Product not found');
    const product = await prisma.product.update({
      where: { id: existing.id },
      data,
      include: { variants: { orderBy: { sortOrder: 'asc' } } },
    });
    sendOk(res, req, { product });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const existing = await prisma.product.findFirst({
      where: { id: String(req.params.id), accountId },
      include: { variants: { select: { id: true } } },
    });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Product not found');
    const variantIds = existing.variants.map((v) => v.id);
    const sold = await prisma.transactionItem.count({
      where: { variantId: { in: variantIds } },
    });
    if (sold > 0) {
      const product = await prisma.product.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      return sendOk(res, req, { product, deactivated: true });
    }
    await prisma.product.delete({ where: { id: existing.id } });
    sendOk(res, req, { id: existing.id, deleted: true });
  }),
);

// ── Variants ──

router.post(
  '/:id/variants',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const product = await prisma.product.findFirst({
      where: { id: String(req.params.id), accountId },
    });
    if (!product) throw new ApiError(404, 'NOT_FOUND', 'Product not found');
    const v = variantInput.parse(req.body);
    const variant = await prisma.productVariant.create({
      data: {
        id: newId('var'),
        accountId,
        productId: product.id,
        name: v.name ?? 'Default',
        sku: v.sku ?? null,
        barcode: v.barcode ?? null,
        price: v.price,
        cost: v.cost ?? 0,
        sortOrder: v.sortOrder ?? 0,
      },
    });
    sendCreated(res, req, { variant });
  }),
);

router.patch(
  '/:id/variants/:vid',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const data = variantInput.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
    const variant = await prisma.productVariant.findFirst({
      where: { id: String(req.params.vid), productId: String(req.params.id), accountId },
    });
    if (!variant) throw new ApiError(404, 'NOT_FOUND', 'Variant not found');
    const updated = await prisma.productVariant.update({
      where: { id: variant.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.sku !== undefined ? { sku: data.sku } : {}),
        ...(data.barcode !== undefined ? { barcode: data.barcode } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.cost !== undefined ? { cost: data.cost } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    sendOk(res, req, { variant: updated });
  }),
);

router.delete(
  '/:id/variants/:vid',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const variant = await prisma.productVariant.findFirst({
      where: { id: String(req.params.vid), productId: String(req.params.id), accountId },
    });
    if (!variant) throw new ApiError(404, 'NOT_FOUND', 'Variant not found');
    const sold = await prisma.transactionItem.count({ where: { variantId: variant.id } });
    if (sold > 0) {
      const updated = await prisma.productVariant.update({
        where: { id: variant.id },
        data: { isActive: false },
      });
      return sendOk(res, req, { variant: updated, deactivated: true });
    }
    await prisma.productVariant.delete({ where: { id: variant.id } });
    sendOk(res, req, { id: variant.id, deleted: true });
  }),
);

export default router;
