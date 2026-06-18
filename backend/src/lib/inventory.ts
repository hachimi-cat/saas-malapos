import type { Prisma, StockMovementType } from '@prisma/client';
import { prisma } from './db.js';
import { newId } from './ids.js';

/*
 * Stock primitive. Every stock change goes through `applyMovement` so the
 * append-only StockMovement ledger and the denormalized StockLevel balance
 * can never drift. Call INSIDE a transaction.
 *
 *   qtyDelta: signed — + inbound (PURCHASE/RETURN/TRANSFER_IN),
 *                      − outbound (SALE/WASTE/TRANSFER_OUT).
 *
 * The caller decides whether a variant is tracked (Product.trackStock);
 * untracked variants (services) simply skip this call.
 */
export async function applyMovement(
  tx: Prisma.TransactionClient,
  m: {
    accountId: string;
    outletId: string;
    variantId: string;
    type: StockMovementType;
    qtyDelta: number;
    batchId?: string | null;
    refType?: string | null;
    refId?: string | null;
    reason?: string | null;
    bySub?: string | null;
  },
): Promise<number> {
  const level = await tx.stockLevel.upsert({
    where: { outletId_variantId: { outletId: m.outletId, variantId: m.variantId } },
    create: {
      id: newId('lvl'),
      accountId: m.accountId,
      outletId: m.outletId,
      variantId: m.variantId,
      quantity: m.qtyDelta,
    },
    update: { quantity: { increment: m.qtyDelta } },
  });

  if (m.batchId) {
    await tx.stockBatch.update({
      where: { id: m.batchId },
      data: { qtyRemaining: { increment: m.qtyDelta } },
    });
  }

  await tx.stockMovement.create({
    data: {
      id: newId('stk'),
      accountId: m.accountId,
      outletId: m.outletId,
      variantId: m.variantId,
      batchId: m.batchId ?? null,
      type: m.type,
      qtyDelta: m.qtyDelta,
      balanceAfter: level.quantity,
      refType: m.refType ?? null,
      refId: m.refId ?? null,
      reason: m.reason ?? null,
      bySub: m.bySub ?? null,
    },
  });

  return level.quantity;
}

/**
 * How many of a COMPOSITE variant can be assembled at an outlet, given current
 * component stock. = min over components of floor(componentStock / qtyNeeded).
 *
 * A composite tracks no stock of its own; this derives sellable units from the
 * scarcest component. Components that don't track stock (services) are ignored.
 * Returns `null` when the variant isn't a composite or has no components, so
 * callers can fall back to the variant's own StockLevel.
 */
export async function compositeAvailable(
  accountId: string,
  outletId: string,
  parentVariantId: string,
): Promise<number | null> {
  const components = await prisma.recipeComponent.findMany({
    where: { accountId, parentVariantId },
    include: { component: { include: { product: true } } },
  });
  if (!components.length) return null;

  let min = Infinity;
  for (const c of components) {
    if (c.component.product.kind === 'SERVICE' || !c.component.product.trackStock) continue;
    if (c.quantity <= 0) continue;
    const level = await prisma.stockLevel.findUnique({
      where: { outletId_variantId: { outletId, variantId: c.componentVariantId } },
      select: { quantity: true },
    });
    const onHand = level?.quantity ?? 0;
    const canMake = Math.floor(onHand / c.quantity);
    if (canMake < min) min = canMake;
  }
  // All components were untracked/zero-qty → effectively unlimited; report 0
  // rather than Infinity so the number is always finite.
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}
