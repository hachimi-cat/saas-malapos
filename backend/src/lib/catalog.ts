import { z } from 'zod';

/* Shared catalog validation. Variants carry price/sku/barcode/cost. */

export const MAX_PRICE_IDR = 1_000_000_000; // Rp 1B ceiling, sanity guard

export const variantInput = z.object({
  name: z.string().trim().min(1).max(80).optional().default('Default'),
  sku: z.string().trim().max(64).nullish(),
  barcode: z.string().trim().max(64).nullish(),
  price: z.number().int().min(0).max(MAX_PRICE_IDR),
  cost: z.number().int().min(0).max(MAX_PRICE_IDR).optional().default(0),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export const productCreate = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullish(),
  categoryId: z.string().trim().nullish(),
  kind: z.enum(['GOODS', 'SERVICE']).optional().default('GOODS'),
  trackStock: z.boolean().optional(),
  requiresBatch: z.boolean().optional().default(false),
  imageUrl: z.string().trim().max(600).nullish(),
  isActive: z.boolean().optional().default(true),
  // At least one variant; a simple product just sends one.
  variants: z.array(variantInput).min(1).max(50),
});

export const productPatch = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).nullish(),
    categoryId: z.string().trim().nullish(),
    kind: z.enum(['GOODS', 'SERVICE']),
    trackStock: z.boolean(),
    requiresBatch: z.boolean(),
    imageUrl: z.string().trim().max(600).nullish(),
    isActive: z.boolean(),
  })
  .partial();
