import type { Prisma, StockMovementType } from '@prisma/client';
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
