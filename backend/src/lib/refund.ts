import { prisma } from './db.js';
import { newId } from './ids.js';
import { ApiError } from './http.js';
import { applyMovement } from './inventory.js';
import { writeOutbox } from './outbox.js';
import { clawbackMarketing } from './sell.js';

/*
 * Partial / line-item refunds. Where voidSale reverses a whole sale, refundSale
 * gives back either selected line items (with quantities) or a flat amount, and
 * optionally restocks. A sale can accrue several Refund rows up to its total;
 * Transaction.refundedTotal tracks the running sum and the status flips to
 * PARTIALLY_REFUNDED (< total) or REFUNDED (>= total).
 *
 * Restock mirrors voidSale's stock reversal: composite (`isComposite`) lines
 * return each recipe component (component.quantity × refunded qty); plain
 * tracked lines return their own qty. Services + untracked products skip stock.
 */

export interface RefundLineInput {
  transactionItemId: string;
  qty: number;
}
export interface RefundInput {
  /** Line-item refund: which lines + how many of each. */
  lines?: RefundLineInput[];
  /** Flat-amount refund (used when `lines` is empty/absent). */
  amount?: number;
  /** Return refunded goods to stock (RETURN movements). */
  restock?: boolean;
  reason?: string | null;
}
export interface RefundContext {
  accountId: string;
  bySub?: string | null;
}

export async function refundSale(
  transactionId: string,
  input: RefundInput,
  ctx: RefundContext,
): Promise<string> {
  const { accountId } = ctx;

  const txn = await prisma.transaction.findFirst({
    where: { id: transactionId, accountId },
    include: { items: { include: { variant: { include: { product: true } } } } },
  });
  if (!txn) throw new ApiError(404, 'NOT_FOUND', 'Transaction not found');
  if (txn.status === 'VOIDED') {
    throw new ApiError(409, 'CONFLICT', 'Cannot refund a voided sale');
  }
  if (txn.status !== 'COMPLETED' && txn.status !== 'PARTIALLY_REFUNDED') {
    throw new ApiError(409, 'CONFLICT', `Cannot refund a ${txn.status.toLowerCase()} sale`);
  }

  const refundable = txn.total - txn.refundedTotal;
  if (refundable <= 0) {
    throw new ApiError(409, 'CONFLICT', 'Sale is already fully refunded');
  }

  const itemById = new Map(txn.items.map((it) => [it.id, it]));
  const lineInputs = input.lines ?? [];

  // Resolve the refund amount + the per-line plan (for snapshot + restock).
  let amount: number;
  const linePlan: {
    item: (typeof txn.items)[number];
    qty: number;
    amount: number;
  }[] = [];

  if (lineInputs.length > 0) {
    let sum = 0;
    for (const li of lineInputs) {
      const item = itemById.get(li.transactionItemId);
      if (!item) throw new ApiError(404, 'NOT_FOUND', `Line ${li.transactionItemId} not on this sale`);
      if (!Number.isInteger(li.qty) || li.qty <= 0) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Refund qty must be a positive integer');
      }
      if (li.qty > item.quantity) {
        throw new ApiError(422, 'VALIDATION_ERROR', `Cannot refund ${li.qty} of ${item.quantity} sold`);
      }
      // Per-unit value of the line (lineTotal already nets per-line discount).
      const perUnit = Math.round(item.lineTotal / item.quantity);
      const lineAmount = li.qty === item.quantity ? item.lineTotal : perUnit * li.qty;
      linePlan.push({ item, qty: li.qty, amount: lineAmount });
      sum += lineAmount;
    }
    amount = sum;
  } else {
    if (input.amount == null || !Number.isInteger(input.amount) || input.amount <= 0) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Provide either line items or a positive amount to refund');
    }
    amount = input.amount;
  }

  if (amount > refundable) {
    throw new ApiError(
      422,
      'VALIDATION_ERROR',
      `Refund ${amount} exceeds the refundable balance of ${refundable}`,
    );
  }

  const restock = input.restock ?? false;
  const refundId = newId('rfd');
  const newRefundedTotal = txn.refundedTotal + amount;
  const nextStatus = newRefundedTotal >= txn.total ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

  await prisma.$transaction(async (tx) => {
    // Restock — only for line-item refunds (a flat-amount refund has no
    // line quantities to return). Mirror voidSale's composite handling.
    if (restock && linePlan.length > 0) {
      for (const { item, qty } of linePlan) {
        if (!item.variantId || !item.variant) continue;
        if (item.variant.product.kind === 'SERVICE') continue;
        if (item.variant.isComposite) {
          const components = await tx.recipeComponent.findMany({
            where: { accountId, parentVariantId: item.variantId },
            include: { component: { include: { product: true } } },
          });
          for (const c of components) {
            if (c.component.product.kind === 'SERVICE' || !c.component.product.trackStock) continue;
            await applyMovement(tx, {
              accountId,
              outletId: txn.outletId,
              variantId: c.componentVariantId,
              type: 'RETURN',
              qtyDelta: c.quantity * qty,
              refType: 'recipe',
              refId: txn.id,
              reason: 'refund',
              bySub: ctx.bySub ?? null,
            });
          }
          continue;
        }
        if (!item.variant.product.trackStock) continue;
        await applyMovement(tx, {
          accountId,
          outletId: txn.outletId,
          variantId: item.variantId,
          type: 'RETURN',
          qtyDelta: qty,
          batchId: item.batchId,
          refType: 'transaction',
          refId: txn.id,
          reason: 'refund',
          bySub: ctx.bySub ?? null,
        });
      }
    }

    await tx.refund.create({
      data: {
        id: refundId,
        accountId,
        transactionId: txn.id,
        amount,
        reason: input.reason ?? null,
        restocked: restock && linePlan.length > 0,
        lines: linePlan.map((p) => ({
          transactionItemId: p.item.id,
          qty: p.qty,
          amount: p.amount,
        })),
        bySub: ctx.bySub ?? null,
      },
    });

    await tx.transaction.update({
      where: { id: txn.id },
      data: { refundedTotal: newRefundedTotal, status: nextStatus },
    });

    await writeOutbox(tx, {
      type: 'malapos.sale.refunded.v1',
      accountId,
      aggregateId: txn.id,
      data: {
        transactionId: txn.id,
        refundId,
        amount,
        refundedTotal: newRefundedTotal,
        status: nextStatus,
        restocked: restock && linePlan.length > 0,
      },
    });
  });

  // Marketing (Ripllo) claw-back — only on a FULL refund (status flips to
  // REFUNDED), since Ripllo's loyalty void is all-or-nothing per
  // externalRef and a partial refund shouldn't reverse the whole earn.
  // Module-gated + best-effort (no-op when the module is off).
  if (nextStatus === 'REFUNDED') {
    await clawbackMarketing(accountId, txn.id);
  }

  return refundId;
}
