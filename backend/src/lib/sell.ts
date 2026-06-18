import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { newId } from './ids.js';
import { ApiError } from './http.js';
import { applyMovement } from './inventory.js';
import { redeemGiftCard } from './giftcards.js';
import { writeOutbox } from './outbox.js';

/*
 * The sell flow — the load-bearing path. Builds a Transaction from a cart,
 * deducts stock (FEFO across dated batches for pharmacy products), records
 * payments (cash change, QRIS/card refs), updates customer loyalty, and
 * emits malapos.sale.completed.v1 — all in one DB transaction.
 *
 * Overselling is allowed (stock may go negative) — a counter sale must never
 * be blocked by a stale count; low/negative stock surfaces in alerts instead.
 */

export interface CartModifier {
  name: string;
  price: number; // per-unit surcharge, IDR
}
export interface CartLine {
  variantId: string;
  quantity: number;
  unitPrice?: number; // override; defaults to the variant's price
  discount?: number; // per-line discount, IDR
  modifiers?: CartModifier[];
}
export interface SalePayment {
  method: 'CASH' | 'QRIS' | 'CARD' | 'GIFT_CARD' | 'OTHER';
  amount: number;
  tendered?: number; // CASH: cash handed over (for change)
  reference?: string; // GIFT_CARD: the gift-card code to redeem
  plugipayRef?: string;
  status?: 'PENDING' | 'PAID' | 'FAILED';
}
export interface CreateSaleInput {
  outletId: string;
  shiftId?: string | null;
  customerId?: string | null;
  items: CartLine[];
  orderDiscount?: number;
  payments?: SalePayment[];
  status?: 'COMPLETED' | 'PARKED';
  note?: string | null;
}
export interface SaleContext {
  accountId: string;
  cashierSub?: string | null;
  cashierName?: string | null;
}

const LOYALTY_POINTS_PER_IDR = 1000; // 1 point per Rp 1.000 spent

function receiptNumber(seq: number): string {
  return `INV-${String(seq).padStart(6, '0')}`;
}

/** Allocate `qty` of a tracked variant across FEFO batches at an outlet.
 *  Returns [{ batchId, qty }]. Falls back to a single null-batch allocation
 *  when the product isn't batch-tracked or no batch stock exists. */
async function allocate(
  tx: Prisma.TransactionClient,
  accountId: string,
  outletId: string,
  variantId: string,
  requiresBatch: boolean,
  qty: number,
): Promise<{ batchId: string | null; qty: number }[]> {
  if (!requiresBatch) return [{ batchId: null, qty }];
  const batches = await tx.stockBatch.findMany({
    where: { accountId, outletId, variantId, qtyRemaining: { gt: 0 } },
    orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
  });
  const out: { batchId: string | null; qty: number }[] = [];
  let left = qty;
  for (const b of batches) {
    if (left <= 0) break;
    const take = Math.min(left, b.qtyRemaining);
    out.push({ batchId: b.id, qty: take });
    left -= take;
  }
  // Any shortfall sells without a batch (oversell) so we never block a sale.
  if (left > 0) out.push({ batchId: null, qty: left });
  return out;
}

export async function createSale(input: CreateSaleInput, ctx: SaleContext): Promise<string> {
  const { accountId } = ctx;
  if (!input.items.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Cart is empty');

  const outlet = await prisma.outlet.findFirst({ where: { id: input.outletId, accountId } });
  if (!outlet) throw new ApiError(404, 'NOT_FOUND', 'Outlet not found');

  // Resolve variants (+ their product, for stock flags + name snapshot).
  const variantIds = input.items.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, accountId },
    include: { product: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  // Build line snapshots + subtotal.
  let subtotal = 0;
  const lines = input.items.map((line) => {
    const v = byId.get(line.variantId);
    if (!v) throw new ApiError(404, 'NOT_FOUND', `Variant ${line.variantId} not found`);
    if (line.quantity <= 0) throw new ApiError(422, 'VALIDATION_ERROR', 'Quantity must be positive');
    const unitPrice = line.unitPrice ?? v.price;
    const mods = (line.modifiers ?? []).map((m) => ({ name: m.name, price: Math.max(0, m.price) }));
    const modTotal = mods.reduce((s, m) => s + m.price, 0);
    const discount = Math.max(0, line.discount ?? 0);
    const lineTotal = (unitPrice + modTotal) * line.quantity - discount;
    subtotal += lineTotal;
    return { line, v, unitPrice, mods, discount, lineTotal: Math.max(0, lineTotal) };
  });

  const orderDiscount = Math.max(0, input.orderDiscount ?? 0);
  const taxBase = Math.max(0, subtotal - orderDiscount);
  const bps = outlet.taxRateBps;
  let taxTotal = 0;
  let total = taxBase;
  if (bps > 0) {
    if (outlet.taxInclusive) {
      // Prices already include tax — back it out for reporting.
      taxTotal = Math.round(taxBase - (taxBase * 10000) / (10000 + bps));
      total = taxBase;
    } else {
      taxTotal = Math.round((taxBase * bps) / 10000);
      total = taxBase + taxTotal;
    }
  }

  const status = input.status ?? 'COMPLETED';
  const payments = input.payments ?? [];
  let paidTotal = 0;
  let changeTotal = 0;
  for (const p of payments) {
    const st = p.status ?? (p.method === 'QRIS' ? 'PAID' : 'PAID');
    if (st === 'PAID') paidTotal += p.amount;
    if (p.method === 'CASH' && p.tendered != null) changeTotal += Math.max(0, p.tendered - p.amount);
  }

  // F&B workspaces route sales/parks to the kitchen display. PosSettings is
  // keyed by accountId; a non-FNB (or absent) workspace leaves kdsState null.
  const settings = await prisma.posSettings.findUnique({ where: { accountId } });
  const kdsState = settings?.businessType === 'FNB' ? 'NEW' : null;

  const txnId = newId('txn');

  await prisma.$transaction(async (tx) => {
    // Receipt number — bump the per-outlet counter atomically.
    const bumped = await tx.outlet.update({
      where: { id: outlet.id },
      data: { receiptSeq: { increment: 1 } },
      select: { receiptSeq: true },
    });
    const number = receiptNumber(bumped.receiptSeq);

    await tx.transaction.create({
      data: {
        id: txnId,
        accountId,
        outletId: outlet.id,
        shiftId: input.shiftId ?? null,
        customerId: input.customerId ?? null,
        cashierSub: ctx.cashierSub ?? null,
        cashierName: ctx.cashierName ?? null,
        number,
        status,
        subtotal,
        discountTotal: orderDiscount,
        taxTotal,
        total,
        paidTotal,
        changeTotal,
        kdsState,
        note: input.note ?? null,
        completedAt: status === 'COMPLETED' ? new Date() : null,
        items: {
          create: lines.map((l) => ({
            id: newId('tli'),
            accountId,
            variantId: l.v.id,
            productName: l.v.product.name,
            variantName: l.v.name,
            sku: l.v.sku,
            unitPrice: l.unitPrice,
            quantity: l.line.quantity,
            discount: l.discount,
            modifiers: l.mods as unknown as Prisma.InputJsonValue,
            lineTotal: l.lineTotal,
          })),
        },
        payments: {
          create: payments.map((p) => ({
            id: newId('pay'),
            accountId,
            method: p.method,
            status: p.status ?? 'PAID',
            amount: p.amount,
            tendered: p.method === 'CASH' ? (p.tendered ?? null) : null,
            change:
              p.method === 'CASH' && p.tendered != null ? Math.max(0, p.tendered - p.amount) : null,
            reference: p.reference ?? null,
            plugipayRef: p.plugipayRef ?? null,
            paidAt: (p.status ?? 'PAID') === 'PAID' ? new Date() : null,
          })),
        },
      },
    });

    // Gift-card / store-credit redemption — validate + decrement each
    // GIFT_CARD payment within the sale transaction so an insufficient
    // balance (or a void/unknown card) rolls the whole sale back.
    for (const p of payments) {
      if (p.method !== 'GIFT_CARD') continue;
      if ((p.status ?? 'PAID') !== 'PAID') continue;
      const code = (p.reference ?? '').trim();
      if (!code) throw new ApiError(422, 'VALIDATION_ERROR', 'Gift-card payment requires a code in `reference`');
      await redeemGiftCard(tx, { accountId, code, amount: p.amount, transactionId: txnId });
    }

    // Stock deduction — only for COMPLETED sales of tracked goods.
    if (status === 'COMPLETED') {
      for (const l of lines) {
        if (l.v.product.kind === 'SERVICE') continue;
        if (l.v.isComposite) {
          // Composite: track NO stock of the variant itself; instead deduct
          // each component (component.quantity × line.quantity) through the
          // ledger. Covers F&B recipes, retail kits and break-bulk uniformly.
          const components = await tx.recipeComponent.findMany({
            where: { accountId, parentVariantId: l.v.id },
            include: { component: { include: { product: true } } },
          });
          for (const c of components) {
            if (c.component.product.kind === 'SERVICE' || !c.component.product.trackStock) continue;
            const qty = c.quantity * l.line.quantity;
            const allocs = await allocate(
              tx,
              accountId,
              outlet.id,
              c.componentVariantId,
              c.component.product.requiresBatch,
              qty,
            );
            for (const a of allocs) {
              await applyMovement(tx, {
                accountId,
                outletId: outlet.id,
                variantId: c.componentVariantId,
                type: 'SALE',
                qtyDelta: -a.qty,
                batchId: a.batchId,
                refType: 'recipe',
                refId: txnId,
                bySub: ctx.cashierSub ?? null,
              });
            }
          }
          continue;
        }
        if (!l.v.product.trackStock) continue;
        const allocs = await allocate(
          tx,
          accountId,
          outlet.id,
          l.v.id,
          l.v.product.requiresBatch,
          l.line.quantity,
        );
        for (const a of allocs) {
          await applyMovement(tx, {
            accountId,
            outletId: outlet.id,
            variantId: l.v.id,
            type: 'SALE',
            qtyDelta: -a.qty,
            batchId: a.batchId,
            refType: 'transaction',
            refId: txnId,
            bySub: ctx.cashierSub ?? null,
          });
        }
      }

      // Loyalty + lifetime stats.
      if (input.customerId) {
        const earned = Math.floor(total / LOYALTY_POINTS_PER_IDR);
        await tx.customer.update({
          where: { id: input.customerId },
          data: {
            totalSpent: { increment: total },
            visits: { increment: 1 },
            ...(earned > 0 ? { loyaltyPoints: { increment: earned } } : {}),
          },
        });
        if (earned > 0) {
          await tx.loyaltyEntry.create({
            data: {
              id: newId('loy'),
              accountId,
              customerId: input.customerId,
              points: earned,
              reason: 'earn',
              transactionId: txnId,
            },
          });
        }
      }

      await writeOutbox(tx, {
        type: 'malapos.sale.completed.v1',
        accountId,
        aggregateId: txnId,
        data: { transactionId: txnId, outletId: outlet.id, total, number },
      });
    }
  });

  return txnId;
}

/** Reverse a completed sale: return stock, mark VOIDED, emit event. */
export async function voidSale(
  accountId: string,
  transactionId: string,
  reason: string | null,
  bySub: string | null,
): Promise<void> {
  const txn = await prisma.transaction.findFirst({
    where: { id: transactionId, accountId },
    include: { items: { include: { variant: { include: { product: true } } } } },
  });
  if (!txn) throw new ApiError(404, 'NOT_FOUND', 'Transaction not found');
  if (txn.status === 'VOIDED') return;
  if (txn.status !== 'COMPLETED') {
    throw new ApiError(409, 'CONFLICT', `Cannot void a ${txn.status.toLowerCase()} sale`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: txn.id },
      data: { status: 'VOIDED', voidedAt: new Date(), voidReason: reason },
    });
    for (const it of txn.items) {
      if (!it.variantId || !it.variant) continue;
      if (it.variant.product.kind === 'SERVICE') continue;
      if (it.variant.isComposite) {
        // Mirror the composite deduction in createSale: return each component
        // (component.quantity × line.quantity) rather than the composite itself
        // (which tracks no stock). Batch is not restored to a specific lot —
        // FEFO already consumed it; the level + ledger are what matter.
        const components = await tx.recipeComponent.findMany({
          where: { accountId, parentVariantId: it.variantId },
          include: { component: { include: { product: true } } },
        });
        for (const c of components) {
          if (c.component.product.kind === 'SERVICE' || !c.component.product.trackStock) continue;
          await applyMovement(tx, {
            accountId,
            outletId: txn.outletId,
            variantId: c.componentVariantId,
            type: 'RETURN',
            qtyDelta: c.quantity * it.quantity,
            refType: 'recipe',
            refId: txn.id,
            reason: 'void',
            bySub,
          });
        }
        continue;
      }
      if (!it.variant.product.trackStock) continue;
      await applyMovement(tx, {
        accountId,
        outletId: txn.outletId,
        variantId: it.variantId,
        type: 'RETURN',
        qtyDelta: it.quantity,
        batchId: it.batchId,
        refType: 'transaction',
        refId: txn.id,
        reason: 'void',
        bySub,
      });
    }
    await writeOutbox(tx, {
      type: 'malapos.sale.voided.v1',
      accountId,
      aggregateId: txn.id,
      data: { transactionId: txn.id, reason },
    });
  });
}
