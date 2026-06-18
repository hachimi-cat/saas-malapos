import { prisma } from './db.js';
import { newId } from './ids.js';
import { ApiError } from './http.js';
import { applyMovement } from './inventory.js';
import { writeOutbox } from './outbox.js';

/*
 * Purchasing receive flow. Receiving a PO turns ordered lines into on-hand
 * stock: it bumps each line's receivedQty, lays down a dated StockBatch when
 * the product is batch-tracked (pharmacy) and a batch reference is supplied,
 * pushes a PURCHASE movement through the ledger, and refreshes the variant's
 * last-cost. When every line is fully received the PO flips to RECEIVED;
 * otherwise PARTIAL. Runs in one transaction and emits
 * malapos.purchase_order.received.v1.
 */

export interface ReceiveLine {
  itemId: string;
  receivedQty: number; // > 0
  batchNo?: string | null;
  expiryDate?: string | Date | null; // ISO string or coerced Date
}

/** Receive (some of) a purchase order. Returns the PO id (caller re-reads). */
export async function receivePurchaseOrder(
  accountId: string,
  purchaseOrderId: string,
  lines: ReceiveLine[],
  bySub: string | null,
): Promise<void> {
  if (!lines.length) throw new ApiError(422, 'VALIDATION_ERROR', 'No lines to receive');

  const po = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, accountId },
    include: { items: true },
  });
  if (!po) throw new ApiError(404, 'NOT_FOUND', 'Purchase order not found');
  if (po.status !== 'ORDERED' && po.status !== 'PARTIAL') {
    throw new ApiError(409, 'CONFLICT', `Cannot receive a ${po.status.toLowerCase()} purchase order`);
  }

  const byId = new Map(po.items.map((i) => [i.id, i]));

  // Resolve each line's variant → product (for requiresBatch / trackStock).
  const variantIds = [...new Set(po.items.map((i) => i.variantId))];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, accountId },
    include: { product: true },
  });
  const variantById = new Map(variants.map((v) => [v.id, v]));

  await prisma.$transaction(async (tx) => {
    for (const line of lines) {
      const item = byId.get(line.itemId);
      if (!item) throw new ApiError(404, 'NOT_FOUND', `Line ${line.itemId} not found on this purchase order`);

      // Cap the received amount at the outstanding quantity.
      const outstanding = item.quantity - item.receivedQty;
      const received = Math.min(line.receivedQty, Math.max(0, outstanding));
      if (received <= 0) continue;

      await tx.purchaseOrderItem.update({
        where: { id: item.id },
        data: { receivedQty: { increment: received } },
      });

      // Refresh the variant's last-cost from this line.
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { cost: item.cost },
      });

      const variant = variantById.get(item.variantId);
      const product = variant?.product;

      const batchNo = line.batchNo ?? item.batchNo ?? null;
      const expiryRaw = line.expiryDate ?? null;
      const expiryDate = expiryRaw ? new Date(expiryRaw) : item.expiryDate ?? null;

      let batchId: string | null = null;
      if (product?.requiresBatch && (batchNo || expiryDate)) {
        const batch = await tx.stockBatch.create({
          data: {
            id: newId('bat'),
            accountId,
            outletId: po.outletId,
            variantId: item.variantId,
            batchNo,
            expiryDate,
            qtyRemaining: 0, // applyMovement increments it
            cost: item.cost,
          },
        });
        batchId = batch.id;
      }

      await applyMovement(tx, {
        accountId,
        outletId: po.outletId,
        variantId: item.variantId,
        type: 'PURCHASE',
        qtyDelta: received,
        batchId,
        refType: 'purchase_order',
        refId: po.id,
        bySub,
      });
    }

    // Re-read line state to decide the PO status.
    const items = await tx.purchaseOrderItem.findMany({ where: { purchaseId: po.id } });
    const fullyReceived = items.every((i) => i.receivedQty >= i.quantity);
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: fullyReceived ? 'RECEIVED' : 'PARTIAL',
        receivedAt: fullyReceived ? new Date() : po.receivedAt,
      },
    });

    await writeOutbox(tx, {
      type: 'malapos.purchase_order.received.v1',
      accountId,
      aggregateId: po.id,
      data: { purchaseOrderId: po.id, outletId: po.outletId },
    });
  });
}
