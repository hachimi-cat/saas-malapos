import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { newId } from './ids.js';
import { ApiError } from './http.js';
import { applyMovement } from './inventory.js';
import { redeemGiftCard } from './giftcards.js';
import { redeemGiftCardPlugipay } from './giftcards-plugipay.js';
import { writeOutbox } from './outbox.js';
import { emitFnbChange } from './realtime.js';
import { marketingClientIfEnabled } from '../services/ripllo-module-service.js';
import { paymentClientIfEnabled } from '../services/plugipay-module-service.js';

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
  /** Free-text per-item instruction (e.g. "no onions"); shown on the KDS +
   *  serve boards. Stored on TransactionItem.note. */
  note?: string | null;
}
export interface SalePayment {
  method: 'CASH' | 'QRIS' | 'CARD' | 'GIFT_CARD' | 'OTHER';
  amount: number;
  tendered?: number; // CASH: cash handed over (for change)
  reference?: string; // GIFT_CARD: the gift-card code to redeem
  plugipayRef?: string;
  status?: 'PENDING' | 'PAID' | 'FAILED';
}
export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

export interface CreateSaleInput {
  outletId: string;
  shiftId?: string | null;
  customerId?: string | null;
  /** F&B: seat the sale at a dine-in table (the table's open bill when
   *  PARKED). Validated against the outlet; null/absent = takeaway. */
  tableId?: string | null;
  /** How the sale is served. Defaults to TAKEAWAY (the counter). */
  orderType?: OrderType;
  items: CartLine[];
  orderDiscount?: number;
  payments?: SalePayment[];
  status?: 'COMPLETED' | 'PARKED';
  note?: string | null;
  /** Marketing (Ripllo) module: a discount code to validate + apply as an
   *  order discount, then stamp as redeemed on completion. Ignored when
   *  the module is off. */
  discountCode?: string | null;
  /** Marketing (Ripllo) module: loyalty points to redeem at checkout. The
   *  returned IDR value is applied as an order discount. Ignored when the
   *  module is off or the customer has insufficient balance. */
  redeemPoints?: number | null;
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

/** Validate that a table belongs to this account + outlet (active). Throws
 *  404 otherwise. No-op when tableId is null/absent (takeaway sale). */
async function assertTableInOutlet(
  accountId: string,
  outletId: string,
  tableId: string | null | undefined,
): Promise<void> {
  if (!tableId) return;
  const table = await prisma.table.findFirst({
    where: { id: tableId, accountId, outletId },
    select: { id: true },
  });
  if (!table) throw new ApiError(404, 'NOT_FOUND', 'Table not found for this outlet');
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

/** Resolved sale line for the completion side-effects — a thin snapshot
 *  of the variant's stock flags so the settle path (which re-fetches from
 *  the DB) and the create path (which has them in hand) share one helper. */
interface CompletionLine {
  variantId: string;
  kind: string;
  isComposite: boolean;
  trackStock: boolean;
  requiresBatch: boolean;
  quantity: number;
}

/**
 * The side-effects that fire when a sale becomes COMPLETED: stock
 * deduction (FEFO across batches, composite component expansion),
 * local loyalty accrual + lifetime stats, and the
 * malapos.sale.completed.v1 outbox event — all inside the caller's
 * transaction. Shared by createSale (immediate COMPLETED) and
 * settleParkedSale (dynamic-QRIS confirm). Extracted verbatim from the
 * original createSale block so existing behavior is unchanged.
 */
async function applyCompletionEffects(
  tx: Prisma.TransactionClient,
  args: {
    accountId: string;
    outletId: string;
    txnId: string;
    number: string;
    total: number;
    customerId: string | null;
    lines: CompletionLine[];
    cashierSub: string | null;
    earnLocalLoyalty: boolean;
  },
): Promise<void> {
  const { accountId, outletId, txnId } = args;
  for (const l of args.lines) {
    if (l.kind === 'SERVICE') continue;
    if (l.isComposite) {
      // Composite: track NO stock of the variant itself; instead deduct
      // each component (component.quantity × line.quantity) through the
      // ledger. Covers F&B recipes, retail kits and break-bulk uniformly.
      const components = await tx.recipeComponent.findMany({
        where: { accountId, parentVariantId: l.variantId },
        include: { component: { include: { product: true } } },
      });
      for (const c of components) {
        if (c.component.product.kind === 'SERVICE' || !c.component.product.trackStock) continue;
        const qty = c.quantity * l.quantity;
        const allocs = await allocate(
          tx,
          accountId,
          outletId,
          c.componentVariantId,
          c.component.product.requiresBatch,
          qty,
        );
        for (const a of allocs) {
          await applyMovement(tx, {
            accountId,
            outletId,
            variantId: c.componentVariantId,
            type: 'SALE',
            qtyDelta: -a.qty,
            batchId: a.batchId,
            refType: 'recipe',
            refId: txnId,
            bySub: args.cashierSub,
          });
        }
      }
      continue;
    }
    if (!l.trackStock) continue;
    const allocs = await allocate(tx, accountId, outletId, l.variantId, l.requiresBatch, l.quantity);
    for (const a of allocs) {
      await applyMovement(tx, {
        accountId,
        outletId,
        variantId: l.variantId,
        type: 'SALE',
        qtyDelta: -a.qty,
        batchId: a.batchId,
        refType: 'transaction',
        refId: txnId,
        bySub: args.cashierSub,
      });
    }
  }

  // Loyalty + lifetime stats. CRM stats (totalSpent/visits) always accrue
  // locally. Points have a source-of-truth: module OFF → local ledger
  // earns; module ON → Ripllo is authoritative (the local grant is
  // skipped and the earn is stamped to Ripllo after commit).
  if (args.customerId) {
    const earned = args.earnLocalLoyalty ? Math.floor(args.total / LOYALTY_POINTS_PER_IDR) : 0;
    await tx.customer.update({
      where: { id: args.customerId },
      data: {
        totalSpent: { increment: args.total },
        visits: { increment: 1 },
        ...(earned > 0 ? { loyaltyPoints: { increment: earned } } : {}),
      },
    });
    if (earned > 0) {
      await tx.loyaltyEntry.create({
        data: {
          id: newId('loy'),
          accountId,
          customerId: args.customerId,
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
    data: { transactionId: txnId, outletId, total: args.total, number: args.number },
  });
}

/**
 * Settle a PARKED dynamic-QRIS sale once the Plugipay checkout completes
 * (called from lib/order-payment.ts applyOrderPaymentCompleted, driven by
 * the merchant-order webhook branch). Inside ONE transaction, with a
 * SELECT-then-guard for idempotency:
 *   - re-assert the sale is still PARKED (else no-op → false),
 *   - mark the QRIS payment PAID (+ bump the transaction's paidTotal),
 *   - flip the transaction → COMPLETED (completedAt now),
 *   - run applyCompletionEffects (stock + loyalty + completed event).
 *
 * Returns true when it settled, false when it was already settled (a
 * webhook retry / double delivery). NON-FATAL Ripllo earn stamping is
 * fired post-commit, mirroring createSale.
 */
export async function settleParkedSale(input: {
  accountId: string;
  transactionId: string;
  paymentId: string;
  sessionId: string;
}): Promise<boolean> {
  const { accountId } = input;
  // Module-on check up front — drives whether local loyalty earns (skip
  // it when Ripllo is authoritative). Best-effort: a marketing hiccup
  // must never block a payment settlement, so fall back to local earn.
  let ripllo: Awaited<ReturnType<typeof marketingClientIfEnabled>> = null;
  try {
    ripllo = await marketingClientIfEnabled(accountId);
  } catch {
    ripllo = null;
  }

  const result = await prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.findFirst({
      where: { id: input.transactionId, accountId },
      include: {
        outlet: { select: { id: true } },
        items: { include: { variant: { include: { product: true } } } },
      },
    });
    if (!txn || txn.status !== 'PARKED') return null; // already settled

    const payment = await tx.payment.findFirst({
      where: { id: input.paymentId, transactionId: txn.id },
      select: { id: true, amount: true, status: true },
    });
    if (!payment) return null;

    const now = new Date();
    if (payment.status !== 'PAID') {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID', paidAt: now, plugipayCheckoutSessionId: input.sessionId },
      });
    }
    await tx.transaction.update({
      where: { id: txn.id },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        paidTotal: { increment: payment.status !== 'PAID' ? payment.amount : 0 },
      },
    });

    await applyCompletionEffects(tx, {
      accountId,
      outletId: txn.outletId,
      txnId: txn.id,
      number: txn.number,
      total: txn.total,
      customerId: txn.customerId,
      lines: txn.items
        .filter((it) => it.variantId && it.variant)
        .map((it) => ({
          variantId: it.variantId!,
          kind: it.variant!.product.kind,
          isComposite: it.variant!.isComposite,
          trackStock: it.variant!.product.trackStock,
          requiresBatch: it.variant!.product.requiresBatch,
          quantity: it.quantity,
        })),
      cashierSub: txn.cashierSub,
      earnLocalLoyalty: !ripllo,
    });

    return {
      total: txn.total,
      customerId: txn.customerId,
      outletId: txn.outletId,
      kdsState: txn.kdsState,
    };
  });

  if (!result) return false;

  // F&B realtime: the QRIS settle completed the bill → free its table (floor)
  // and drop the ticket off the kitchen/ready boards (kds/serve).
  if (result.kdsState != null) {
    emitFnbChange(accountId, result.outletId, 'floor');
    emitFnbChange(accountId, result.outletId, 'serve');
    emitFnbChange(accountId, result.outletId, 'kds');
  }

  // Post-commit Ripllo earn (module-on only, non-fatal — same stance as
  // createSale; the sale is already durably settled).
  if (ripllo && result.customerId && result.total > 0) {
    try {
      await ripllo.loyalty.earn({
        customerId: result.customerId,
        orderGrossIdr: result.total,
        externalSource: 'malapos',
        externalRef: input.transactionId,
        orderId: input.transactionId,
      });
    } catch (err) {
      console.error('[sell] ripllo loyalty earn failed on QRIS settle (non-fatal):', {
        transactionId: input.transactionId,
        message: (err as Error).message,
      });
    }
  }
  return true;
}

/**
 * Discard a PARKED sale (e.g. a dynamic-QRIS sale the customer never
 * paid, or the cashier abandoned). A parked sale never deducted stock or
 * earned loyalty, so this is a pure status flip → VOIDED — NO stock
 * return (that path is voidSale, for COMPLETED sales). Idempotent: an
 * already-VOIDED parked sale is a no-op. A COMPLETED sale is rejected
 * (use voidSale).
 */
export async function discardParkedSale(
  accountId: string,
  transactionId: string,
  reason: string | null,
): Promise<void> {
  const txn = await prisma.transaction.findFirst({
    where: { id: transactionId, accountId },
    select: { id: true, status: true, outletId: true, kdsState: true },
  });
  if (!txn) throw new ApiError(404, 'NOT_FOUND', 'Transaction not found');
  if (txn.status === 'VOIDED') return;
  if (txn.status !== 'PARKED') {
    throw new ApiError(409, 'CONFLICT', `Cannot discard a ${txn.status.toLowerCase()} sale`);
  }
  await prisma.transaction.update({
    where: { id: txn.id },
    data: { status: 'VOIDED', voidedAt: new Date(), voidReason: reason, kdsState: null },
  });

  // F&B realtime: discarding an open bill frees its table (floor) and removes
  // the ticket from the kitchen board (kds).
  if (txn.kdsState != null) {
    emitFnbChange(accountId, txn.outletId, 'floor');
    emitFnbChange(accountId, txn.outletId, 'kds');
  }
}

/** Compute tax + total for a given subtotal/orderDiscount against an
 *  outlet's tax config — the same arithmetic createSale uses, factored out
 *  so the open-bill edit path stays identical. */
function priceWithTax(
  subtotal: number,
  orderDiscount: number,
  outlet: { taxRateBps: number; taxInclusive: boolean },
): { taxTotal: number; total: number } {
  const taxBase = Math.max(0, subtotal - orderDiscount);
  const bps = outlet.taxRateBps;
  if (bps <= 0) return { taxTotal: 0, total: taxBase };
  if (outlet.taxInclusive) {
    const taxTotal = Math.round(taxBase - (taxBase * 10000) / (10000 + bps));
    return { taxTotal, total: taxBase };
  }
  const taxTotal = Math.round((taxBase * bps) / 10000);
  return { taxTotal, total: taxBase + taxTotal };
}

export interface UpdateParkedInput {
  items: CartLine[];
  orderDiscount?: number;
  note?: string | null;
  tableId?: string | null;
  orderType?: OrderType;
  customerId?: string | null;
}

/**
 * Edit an open bill (a PARKED sale) — replace its line items + recompute
 * totals, and optionally re-seat it (table/orderType) or attach a customer.
 * A parked sale never deducted stock or earned loyalty, so this only
 * rewrites the cart snapshot; the settle path applies stock/loyalty when
 * the bill is finally charged. Rejects a non-PARKED sale.
 *
 * Marketing discount-codes / point-redemption are intentionally NOT applied
 * here (they bind at completion on the quick-sale path); only a plain
 * `orderDiscount` is honored, keeping the open-bill editor simple.
 */
export async function updateParkedSale(
  accountId: string,
  transactionId: string,
  input: UpdateParkedInput,
): Promise<void> {
  if (!input.items.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Cart is empty');

  const txn = await prisma.transaction.findFirst({
    where: { id: transactionId, accountId },
    select: { id: true, status: true, outletId: true, kdsState: true },
  });
  if (!txn) throw new ApiError(404, 'NOT_FOUND', 'Transaction not found');
  if (txn.status !== 'PARKED') {
    throw new ApiError(409, 'CONFLICT', `Cannot edit a ${txn.status.toLowerCase()} sale`);
  }

  const outlet = await prisma.outlet.findFirst({ where: { id: txn.outletId, accountId } });
  if (!outlet) throw new ApiError(404, 'NOT_FOUND', 'Outlet not found');

  if (input.tableId !== undefined) await assertTableInOutlet(accountId, outlet.id, input.tableId);

  const variantIds = input.items.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, accountId },
    include: { product: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  let subtotal = 0;
  const lines = input.items.map((line) => {
    const v = byId.get(line.variantId);
    if (!v) throw new ApiError(404, 'NOT_FOUND', `Variant ${line.variantId} not found`);
    if (line.quantity <= 0) throw new ApiError(422, 'VALIDATION_ERROR', 'Quantity must be positive');
    const unitPrice = line.unitPrice ?? v.price;
    const mods = (line.modifiers ?? []).map((m) => ({ name: m.name, price: Math.max(0, m.price) }));
    const modTotal = mods.reduce((s, m) => s + m.price, 0);
    const discount = Math.max(0, line.discount ?? 0);
    const note = line.note?.trim() || null;
    const lineTotal = (unitPrice + modTotal) * line.quantity - discount;
    subtotal += lineTotal;
    return { v, unitPrice, mods, discount, note, quantity: line.quantity, lineTotal: Math.max(0, lineTotal) };
  });

  const orderDiscount = Math.max(0, input.orderDiscount ?? 0);
  const { taxTotal, total } = priceWithTax(subtotal, orderDiscount, outlet);

  // Editing a parked F&B bill replaces every line, so all new items start at
  // NEW; the ticket (least-advanced item) therefore re-syncs to NEW too.
  const itemKdsState = txn.kdsState != null ? 'NEW' : null;

  await prisma.$transaction(async (tx) => {
    await tx.transactionItem.deleteMany({ where: { transactionId: txn.id } });
    await tx.transaction.update({
      where: { id: txn.id },
      data: {
        subtotal,
        discountTotal: orderDiscount,
        taxTotal,
        total,
        ...(txn.kdsState != null ? { kdsState: itemKdsState } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.tableId !== undefined ? { tableId: input.tableId } : {}),
        ...(input.orderType ? { orderType: input.orderType } : {}),
        ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
        items: {
          create: lines.map((l) => ({
            id: newId('tli'),
            accountId,
            variantId: l.v.id,
            productName: l.v.product.name,
            variantName: l.v.name,
            sku: l.v.sku,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            discount: l.discount,
            modifiers: l.mods as unknown as Prisma.InputJsonValue,
            note: l.note,
            lineTotal: l.lineTotal,
            kdsState: itemKdsState,
          })),
        },
      },
    });
  });

  // F&B realtime: editing/holding an open bill changes its items (KDS) and its
  // table's total/item-count (floor). Only F&B bills carry a kdsState.
  if (txn.kdsState != null) {
    emitFnbChange(accountId, txn.outletId, 'kds');
    emitFnbChange(accountId, txn.outletId, 'floor');
  }
}

/** A transaction's line items shaped for the completion side-effects.
 *  Structural type — a richer Prisma include is assignable to it — so the
 *  settle / split paths map their fetched items through one helper. */
type CompletionTxnItem = {
  variantId: string | null;
  quantity: number;
  variant:
    | { isComposite: boolean; product: { kind: string; trackStock: boolean; requiresBatch: boolean } }
    | null;
};

/** Project a PARKED transaction's items into the CompletionLine snapshot
 *  applyCompletionEffects consumes (skip orphaned/voided variant lines). */
function mapCompletionLines(items: CompletionTxnItem[]): CompletionLine[] {
  return items
    .filter((it) => it.variantId && it.variant)
    .map((it) => ({
      variantId: it.variantId!,
      kind: it.variant!.product.kind,
      isComposite: it.variant!.isComposite,
      trackStock: it.variant!.product.trackStock,
      requiresBatch: it.variant!.product.requiresBatch,
      quantity: it.quantity,
    }));
}

/**
 * Flip a PARKED transaction → COMPLETED and run the completion side-effects
 * (stock deduction + loyalty + the malapos.sale.completed.v1 event), inside
 * the caller's transaction. The single choke-point both the whole-bill
 * "Charge" (settleParkedSaleManual) and the per-check split-payment
 * (addParkedSalePayment) drive completion through — so the stock/loyalty/
 * outbox effects fire EXACTLY ONCE, regardless of how many payments
 * accumulated to reach the total.
 *
 * The PARKED→COMPLETED flip is an ATOMIC conditional `updateMany` with
 * `where: { status: 'PARKED' }` — the row lock it takes serializes two
 * concurrent final tenders, so only ONE wins the flip (count === 1) and runs
 * the side-effects; the loser sees count === 0 and returns false WITHOUT
 * touching stock/loyalty/outbox. Callers roll their tender's payment row back
 * (throw) when this returns false. Stock can never decrement twice.
 */
async function finalizeParkedCompletion(
  tx: Prisma.TransactionClient,
  args: {
    accountId: string;
    txn: {
      id: string;
      outletId: string;
      number: string;
      total: number;
      customerId: string | null;
      items: CompletionTxnItem[];
    };
    now: Date;
    incPaidTotal: number;
    incChangeTotal: number;
    cashierSub: string | null;
    earnLocalLoyalty: boolean;
  },
): Promise<boolean> {
  const flipped = await tx.transaction.updateMany({
    where: { id: args.txn.id, status: 'PARKED' },
    data: {
      status: 'COMPLETED',
      completedAt: args.now,
      paidTotal: { increment: args.incPaidTotal },
      changeTotal: { increment: args.incChangeTotal },
    },
  });
  // Lost the race — another tender already completed this bill. Do NOT apply
  // completion effects (they fired on the winning flip); the caller rolls back.
  if (flipped.count === 0) return false;

  await applyCompletionEffects(tx, {
    accountId: args.accountId,
    outletId: args.txn.outletId,
    txnId: args.txn.id,
    number: args.txn.number,
    total: args.txn.total,
    customerId: args.txn.customerId,
    lines: mapCompletionLines(args.txn.items),
    cashierSub: args.cashierSub,
    earnLocalLoyalty: args.earnLocalLoyalty,
  });
  return true;
}

/** Post-commit Ripllo loyalty EARN for a now-settled sale (module-on only,
 *  non-fatal). Stamps the FULL order total once, mirroring createSale — so
 *  a split bill earns exactly like a single-tender one, on completion. */
async function riplloEarnPostCommit(
  ripllo: Awaited<ReturnType<typeof marketingClientIfEnabled>>,
  args: { customerId: string | null; total: number; transactionId: string; label: string },
): Promise<void> {
  if (!ripllo || !args.customerId || args.total <= 0) return;
  try {
    await ripllo.loyalty.earn({
      customerId: args.customerId,
      orderGrossIdr: args.total,
      externalSource: 'malapos',
      externalRef: args.transactionId,
      orderId: args.transactionId,
    });
  } catch (err) {
    console.error(`[sell] ripllo loyalty earn failed on ${args.label} (non-fatal):`, {
      transactionId: args.transactionId,
      message: (err as Error).message,
    });
  }
}

/**
 * Settle an open bill (a PARKED sale) at the counter with manual tenders —
 * the F&B "Charge" action. Records the payments, flips the sale to
 * COMPLETED, and runs applyCompletionEffects (stock deduction + loyalty +
 * the completed event), reusing the exact same side-effects as the
 * immediate quick-sale path and the dynamic-QRIS settle. Gift-card tenders
 * are honored (Plugipay workspace when the Payment module is on, else the
 * local ledger) mirroring createSale. Rejects a non-PARKED sale.
 */
export async function settleParkedSaleManual(input: {
  accountId: string;
  transactionId: string;
  payments: SalePayment[];
  cashierSub?: string | null;
}): Promise<void> {
  const { accountId, transactionId } = input;
  const payments = input.payments ?? [];

  const pre = await prisma.transaction.findFirst({
    where: { id: transactionId, accountId },
    select: { id: true, status: true },
  });
  if (!pre) throw new ApiError(404, 'NOT_FOUND', 'Transaction not found');
  if (pre.status !== 'PARKED') {
    throw new ApiError(409, 'CONFLICT', `Cannot settle a ${pre.status.toLowerCase()} sale`);
  }

  // Marketing-module check up front — drives whether local loyalty earns
  // (Ripllo is authoritative when on). Best-effort: never block a payment.
  let ripllo: Awaited<ReturnType<typeof marketingClientIfEnabled>> = null;
  try {
    ripllo = await marketingClientIfEnabled(accountId);
  } catch {
    ripllo = null;
  }

  // Gift-card via Plugipay (module ON) — redeem BEFORE opening the sale txn
  // so an insufficient-balance/void/unknown-card failure aborts cleanly.
  const paymentClient = payments.some((p) => p.method === 'GIFT_CARD')
    ? await paymentClientIfEnabled(accountId)
    : null;
  if (paymentClient) {
    for (const p of payments) {
      if (p.method !== 'GIFT_CARD') continue;
      if ((p.status ?? 'PAID') !== 'PAID') continue;
      const code = (p.reference ?? '').trim();
      if (!code) throw new ApiError(422, 'VALIDATION_ERROR', 'Gift-card payment requires a code in `reference`');
      await redeemGiftCardPlugipay(paymentClient, { code, amount: p.amount, transactionId });
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.findFirst({
      where: { id: transactionId, accountId },
      include: {
        outlet: { select: { id: true } },
        items: { include: { variant: { include: { product: true } } } },
      },
    });
    if (!txn || txn.status !== 'PARKED') return null; // raced / already settled

    const now = new Date();
    let paidTotal = 0;
    let changeTotal = 0;
    for (const p of payments) {
      const st = p.status ?? 'PAID';
      if (st === 'PAID') paidTotal += p.amount;
      if (p.method === 'CASH' && p.tendered != null) changeTotal += Math.max(0, p.tendered - p.amount);
    }

    for (const p of payments) {
      await tx.payment.create({
        data: {
          id: newId('pay'),
          accountId,
          transactionId: txn.id,
          method: p.method,
          status: p.status ?? 'PAID',
          amount: p.amount,
          tendered: p.method === 'CASH' ? (p.tendered ?? null) : null,
          change:
            p.method === 'CASH' && p.tendered != null ? Math.max(0, p.tendered - p.amount) : null,
          reference: p.reference ?? null,
          plugipayRef: p.plugipayRef ?? null,
          paidAt: (p.status ?? 'PAID') === 'PAID' ? now : null,
        },
      });
    }

    // Gift-card local redeem (module OFF) — inside the txn so an
    // insufficient balance rolls the settle back.
    if (!paymentClient) {
      for (const p of payments) {
        if (p.method !== 'GIFT_CARD') continue;
        if ((p.status ?? 'PAID') !== 'PAID') continue;
        const code = (p.reference ?? '').trim();
        if (!code) throw new ApiError(422, 'VALIDATION_ERROR', 'Gift-card payment requires a code in `reference`');
        await redeemGiftCard(tx, { accountId, code, amount: p.amount, transactionId: txn.id });
      }
    }

    const completed = await finalizeParkedCompletion(tx, {
      accountId,
      txn,
      now,
      incPaidTotal: paidTotal,
      incChangeTotal: changeTotal,
      cashierSub: input.cashierSub ?? txn.cashierSub ?? null,
      earnLocalLoyalty: !ripllo,
    });
    // Lost the atomic flip → a concurrent tender already settled it. Throw to
    // roll back the payment rows we just inserted (no double-record / oversum).
    if (!completed) throw new ApiError(409, 'CONFLICT', 'Sale is no longer open');

    return {
      total: txn.total,
      customerId: txn.customerId,
      outletId: txn.outletId,
      kdsState: txn.kdsState,
    };
  });

  if (!result) {
    // Re-read for a clean error (a concurrent settle won the race).
    throw new ApiError(409, 'CONFLICT', 'Sale is no longer open');
  }

  // F&B realtime: completing an open bill frees its table (floor), drops its
  // ticket off the kitchen + ready boards (kds/serve).
  if (result.kdsState != null) {
    emitFnbChange(accountId, result.outletId, 'floor');
    emitFnbChange(accountId, result.outletId, 'serve');
    emitFnbChange(accountId, result.outletId, 'kds');
  }

  // Post-commit Ripllo earn (module-on only, non-fatal — mirrors createSale
  // / settleParkedSale; the sale is already durably settled).
  await riplloEarnPostCommit(ripllo, {
    customerId: result.customerId,
    total: result.total,
    transactionId,
    label: 'manual settle',
  });
}

/**
 * Record ONE payment against an open bill (a PARKED sale) and complete the
 * bill once it is fully covered — the F&B "split bill" path. Each split
 * check calls this with its own tender; payments accumulate in
 * `paidTotal` and the bill stays PARKED (partially paid) until
 * `paidTotal >= total`, at which point it flips to COMPLETED and runs the
 * completion side-effects (stock + loyalty + outbox event) EXACTLY ONCE,
 * via the shared finalizeParkedCompletion — the same choke-point the
 * whole-bill Charge uses. A partial payment NEVER touches stock/loyalty.
 *
 * Gift-card tenders are honored per-payment (Plugipay workspace when the
 * Payments module is on, else the local ledger), mirroring the settle path.
 * Validates: amount > 0, doesn't overshoot the remaining balance beyond a
 * small rounding tolerance, and the bill is PARKED + owned by the account.
 * Returns the bill's post-payment status + running totals.
 */
export async function addParkedSalePayment(input: {
  accountId: string;
  transactionId: string;
  payment: SalePayment;
  cashierSub?: string | null;
}): Promise<{ status: 'PARKED' | 'COMPLETED'; paidTotal: number; total: number; remaining: number }> {
  const { accountId, transactionId } = input;
  const p = input.payment;
  if (p.amount <= 0) throw new ApiError(422, 'VALIDATION_ERROR', 'Payment amount must be positive');

  const pre = await prisma.transaction.findFirst({
    where: { id: transactionId, accountId },
    select: { id: true, status: true, total: true, paidTotal: true },
  });
  if (!pre) throw new ApiError(404, 'NOT_FOUND', 'Transaction not found');
  if (pre.status !== 'PARKED') {
    throw new ApiError(409, 'CONFLICT', `Cannot pay a ${pre.status.toLowerCase()} sale`);
  }

  const isPaid = (p.status ?? 'PAID') === 'PAID';
  const payAmount = isPaid ? p.amount : 0;
  // Reject a tender that overshoots the remaining balance (a split check is
  // never meant to overpay). A small tolerance absorbs any rounding on the
  // final check; exact-sum splits land precisely on the total.
  const OVERPAY_TOLERANCE = 100; // IDR
  const remainingBefore = pre.total - pre.paidTotal;
  if (payAmount > remainingBefore + OVERPAY_TOLERANCE) {
    throw new ApiError(
      422,
      'VALIDATION_ERROR',
      `Payment of ${p.amount} exceeds the remaining balance of ${remainingBefore}`,
    );
  }

  // Marketing-module check up front — drives whether local loyalty earns
  // (Ripllo is authoritative when on). Best-effort: never block a payment.
  let ripllo: Awaited<ReturnType<typeof marketingClientIfEnabled>> = null;
  try {
    ripllo = await marketingClientIfEnabled(accountId);
  } catch {
    ripllo = null;
  }

  // Gift-card via Plugipay (module ON) — redeem BEFORE opening the sale txn
  // so an insufficient-balance / void / unknown-card failure aborts cleanly.
  const paymentClient =
    p.method === 'GIFT_CARD' && isPaid ? await paymentClientIfEnabled(accountId) : null;
  if (paymentClient) {
    const code = (p.reference ?? '').trim();
    if (!code) throw new ApiError(422, 'VALIDATION_ERROR', 'Gift-card payment requires a code in `reference`');
    await redeemGiftCardPlugipay(paymentClient, { code, amount: p.amount, transactionId });
  }

  const result = await prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.findFirst({
      where: { id: transactionId, accountId },
      include: {
        outlet: { select: { id: true } },
        items: { include: { variant: { include: { product: true } } } },
      },
    });
    if (!txn || txn.status !== 'PARKED') return null; // raced / already settled

    const now = new Date();
    const change =
      p.method === 'CASH' && p.tendered != null ? Math.max(0, p.tendered - p.amount) : 0;

    await tx.payment.create({
      data: {
        id: newId('pay'),
        accountId,
        transactionId: txn.id,
        method: p.method,
        status: p.status ?? 'PAID',
        amount: p.amount,
        tendered: p.method === 'CASH' ? (p.tendered ?? null) : null,
        change: p.method === 'CASH' && p.tendered != null ? change : null,
        reference: p.reference ?? null,
        plugipayRef: p.plugipayRef ?? null,
        paidAt: isPaid ? now : null,
      },
    });

    // Gift-card local redeem (module OFF) — inside the txn so an
    // insufficient balance rolls this payment back.
    if (!paymentClient && p.method === 'GIFT_CARD' && isPaid) {
      const code = (p.reference ?? '').trim();
      if (!code) throw new ApiError(422, 'VALIDATION_ERROR', 'Gift-card payment requires a code in `reference`');
      await redeemGiftCard(tx, { accountId, code, amount: p.amount, transactionId: txn.id });
    }

    const newPaid = txn.paidTotal + payAmount;
    if (newPaid >= txn.total) {
      // Final check — fully covered. Complete + run the side-effects ONCE
      // (finalizeParkedCompletion also increments paidTotal/changeTotal, and
      // the atomic flip serializes two concurrent final tenders).
      const completed = await finalizeParkedCompletion(tx, {
        accountId,
        txn,
        now,
        incPaidTotal: payAmount,
        incChangeTotal: change,
        cashierSub: input.cashierSub ?? txn.cashierSub ?? null,
        earnLocalLoyalty: !ripllo,
      });
      // Lost the atomic flip → a concurrent tender already completed the bill.
      // Throw to roll back this payment row (it would otherwise oversum paid).
      if (!completed) throw new ApiError(409, 'CONFLICT', 'Sale is no longer open');
      return {
        completed: true,
        paidTotal: newPaid,
        total: txn.total,
        customerId: txn.customerId,
        outletId: txn.outletId,
        kdsState: txn.kdsState,
      };
    }

    // Still partial — accrue the payment, leave the bill PARKED (no stock /
    // loyalty / outbox side-effects until the bill is fully paid).
    await tx.transaction.update({
      where: { id: txn.id },
      data: { paidTotal: { increment: payAmount }, changeTotal: { increment: change } },
    });
    return {
      completed: false,
      paidTotal: newPaid,
      total: txn.total,
      customerId: txn.customerId,
      outletId: txn.outletId,
      kdsState: txn.kdsState,
    };
  });

  if (!result) throw new ApiError(409, 'CONFLICT', 'Sale is no longer open');

  // Loyalty earn fires only on the completing payment (full total, once).
  if (result.completed) {
    // F&B realtime: the final split tender completed the bill → free the table
    // (floor) + drop the ticket off the kitchen/ready boards (kds/serve). A
    // partial payment changes no board, so we stay quiet.
    if (result.kdsState != null) {
      emitFnbChange(accountId, result.outletId, 'floor');
      emitFnbChange(accountId, result.outletId, 'serve');
      emitFnbChange(accountId, result.outletId, 'kds');
    }
    await riplloEarnPostCommit(ripllo, {
      customerId: result.customerId,
      total: result.total,
      transactionId,
      label: 'split settle',
    });
  }

  return {
    status: result.completed ? 'COMPLETED' : 'PARKED',
    paidTotal: result.paidTotal,
    total: result.total,
    remaining: Math.max(0, result.total - result.paidTotal),
  };
}

export async function createSale(input: CreateSaleInput, ctx: SaleContext): Promise<string> {
  const { accountId } = ctx;
  if (!input.items.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Cart is empty');

  const outlet = await prisma.outlet.findFirst({ where: { id: input.outletId, accountId } });
  if (!outlet) throw new ApiError(404, 'NOT_FOUND', 'Outlet not found');

  // F&B: a dine-in table must belong to this outlet (no-op for takeaway).
  await assertTableInOutlet(accountId, outlet.id, input.tableId);

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

  // Minted up-front so the Ripllo redeem/earn calls below can use it as
  // their idempotency externalRef before the row is written.
  const txnId = newId('txn');

  // ── Marketing (Ripllo) module: discount code + points redemption ──
  // Best-effort + module-gated. `marketingClientIfEnabled` returns null
  // when the module is off (or RIPLLO_* env unset, e.g. local/tests), in
  // which case NONE of this runs and the local loyalty path below is taken
  // unchanged. Any Ripllo failure here is swallowed: a misconfigured
  // marketing integration must never block a counter sale — the worst case
  // is the discount/redemption silently doesn't apply.
  const wantsMarketing =
    (input.discountCode != null && input.discountCode !== '') ||
    (input.redeemPoints != null && input.redeemPoints > 0);
  const ripllo =
    wantsMarketing && (input.status ?? 'COMPLETED') === 'COMPLETED'
      ? await marketingClientIfEnabled(accountId)
      : null;

  let codeDiscount = 0;
  let appliedDiscountCodeId: string | null = null;
  let pointsRedeemed = 0;
  let pointsRedeemValueIdr = 0;

  if (ripllo) {
    // Validate the discount code against the cart (dry-run); the binding
    // redemption is stamped after the sale completes.
    if (input.discountCode) {
      try {
        const v = await ripllo.discountCodes.validate({
          accountId,
          code: input.discountCode,
          subtotal,
          currency: 'IDR',
          customerId: input.customerId ?? null,
          items: lines.map((l) => ({
            productId: l.v.productId,
            price: l.unitPrice,
            quantity: l.line.quantity,
          })),
        });
        if (v.valid && v.code) {
          codeDiscount = Math.max(0, Math.round(v.discountAmount));
          appliedDiscountCodeId = v.code.id;
        }
      } catch {
        /* non-fatal — code simply doesn't apply */
      }
    }

    // Redeem loyalty points → IDR order discount. Validate the balance
    // first so we never attempt to over-redeem.
    if (input.customerId && input.redeemPoints != null && input.redeemPoints > 0) {
      try {
        const bal = await ripllo.loyalty.balance(input.customerId);
        const points = Math.min(Math.floor(input.redeemPoints), bal.balance);
        if (points > 0) {
          const r = await ripllo.loyalty.redeem({
            customerId: input.customerId,
            points,
            externalSource: 'malapos',
            externalRef: `${txnId}:redeem`,
            orderId: txnId,
          });
          pointsRedeemed = r.pointsRedeemed;
          pointsRedeemValueIdr = Math.max(0, Math.round(r.redeemValueIdr));
        }
      } catch {
        /* non-fatal — points simply aren't redeemed */
      }
    }
  }

  const orderDiscount = Math.max(
    0,
    (input.orderDiscount ?? 0) + codeDiscount + pointsRedeemValueIdr,
  );
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

  // ── Gift-card / store-credit tender source-of-truth ──────────────────
  // When the Payments module is ON, gift cards live in the merchant's
  // Plugipay workspace and can't be redeemed inside the local sale txn.
  // Probe up front (non-throwing → null when off / no env / no workspace).
  // If ON and the cart pays with a GIFT_CARD tender, redeem via Plugipay
  // BEFORE opening the local sale txn so an insufficient-balance / void /
  // unknown-card failure aborts the sale cleanly (mirrors the local
  // in-transaction roll-back). Module OFF → the in-transaction local
  // redeem below runs unchanged.
  const paymentClient =
    (status === 'COMPLETED') && payments.some((p) => p.method === 'GIFT_CARD')
      ? await paymentClientIfEnabled(accountId)
      : null;
  if (paymentClient) {
    for (const p of payments) {
      if (p.method !== 'GIFT_CARD') continue;
      if ((p.status ?? 'PAID') !== 'PAID') continue;
      const code = (p.reference ?? '').trim();
      if (!code) throw new ApiError(422, 'VALIDATION_ERROR', 'Gift-card payment requires a code in `reference`');
      await redeemGiftCardPlugipay(paymentClient, { code, amount: p.amount, transactionId: txnId });
    }
  }

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
        tableId: input.tableId ?? null,
        orderType: input.orderType ?? 'TAKEAWAY',
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
            note: l.line.note?.trim() || null,
            lineTotal: l.lineTotal,
            // Per-item KDS state mirrors the ticket: NEW for F&B, null otherwise.
            kdsState,
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
    // balance (or a void/unknown card) rolls the whole sale back. LOCAL
    // path only: when the Payments module is ON (`paymentClient` set) the
    // card lives in Plugipay and was already redeemed above, pre-txn.
    if (!paymentClient) {
      for (const p of payments) {
        if (p.method !== 'GIFT_CARD') continue;
        if ((p.status ?? 'PAID') !== 'PAID') continue;
        const code = (p.reference ?? '').trim();
        if (!code) throw new ApiError(422, 'VALIDATION_ERROR', 'Gift-card payment requires a code in `reference`');
        await redeemGiftCard(tx, { accountId, code, amount: p.amount, transactionId: txnId });
      }
    }

    // Stock deduction + loyalty + completed event — only for COMPLETED
    // sales. The same side-effects run later from settleParkedSale when a
    // dynamic-QRIS sale (parked at ring-up) is confirmed by the Plugipay
    // webhook; both share applyCompletionEffects so the two paths stay
    // identical.
    if (status === 'COMPLETED') {
      await applyCompletionEffects(tx, {
        accountId,
        outletId: outlet.id,
        txnId,
        number,
        total,
        customerId: input.customerId ?? null,
        lines: lines.map((l) => ({
          variantId: l.v.id,
          kind: l.v.product.kind,
          isComposite: l.v.isComposite,
          trackStock: l.v.product.trackStock,
          requiresBatch: l.v.product.requiresBatch,
          quantity: l.line.quantity,
        })),
        cashierSub: ctx.cashierSub ?? null,
        // Module ON → Ripllo is authoritative; skip the local point grant
        // (stamped to Ripllo post-commit, below). Module OFF → earn locally.
        earnLocalLoyalty: !ripllo,
      });
    }
  });

  // F&B realtime: a new kitchen ticket (open-bill park OR completed quick
  // sale) appears on the KDS, and a parked dine-in bill flips its table to
  // occupied on the floor. Non-F&B sales leave kdsState null → no board.
  if (kdsState != null) {
    emitFnbChange(accountId, outlet.id, 'kds');
    emitFnbChange(accountId, outlet.id, 'floor');
  }

  // ── Marketing (Ripllo) post-completion stamping ──────────────────────
  // Runs only when the module is on (`ripllo` set) and the sale committed.
  // ALL best-effort/non-fatal: the sale is already durably committed, so a
  // Ripllo hiccup here must never throw — it would falsely surface as a
  // failed sale to the cashier. We log + continue. (The points-redeem was
  // already stamped pre-sale; here we only EARN + stamp the code redeem.)
  if (ripllo && status === 'COMPLETED') {
    if (input.customerId && total > 0) {
      try {
        await ripllo.loyalty.earn({
          customerId: input.customerId,
          orderGrossIdr: total,
          externalSource: 'malapos',
          externalRef: txnId,
          orderId: txnId,
        });
      } catch (err) {
        console.error('[sell] ripllo loyalty earn failed (non-fatal):', {
          txnId,
          message: (err as Error).message,
        });
      }
    }
    if (appliedDiscountCodeId) {
      try {
        await ripllo.discountCodes.redeem({
          accountId,
          discountCodeId: appliedDiscountCodeId,
          checkoutSessionId: txnId,
          customerId: input.customerId ?? null,
          appliedAmount: codeDiscount,
          externalSource: 'malapos',
          externalRef: txnId,
        });
      } catch (err) {
        console.error('[sell] ripllo discount redeem failed (non-fatal):', {
          txnId,
          message: (err as Error).message,
        });
      }
    }
  }

  // Silence "assigned but only read in a swallowed branch" — pointsRedeemed
  // is surfaced for callers/tests that want the redeemed count.
  void pointsRedeemed;

  return txnId;
}

/**
 * Best-effort Ripllo loyalty/discount claw-back for a reversed sale.
 * Called post-commit from voidSale + refundSale. Module-gated (no-op when
 * the Marketing module is off) and fully non-fatal — a reversal of stock /
 * status must never be undone by a Ripllo failure.
 *
 * Keyed by the originating transaction's externalRef. We void the EARN
 * (externalRef=txnId) and the points-REDEEM (externalRef=`txnId:redeem`)
 * separately; `loyalty.void` is a no-op upstream when no matching ledger
 * row exists, so it's safe to fire both unconditionally. The discount-code
 * redemption is intentionally NOT clawed back here: a code use is a
 * marketing fact (mirrors storlaunch keeping the redemption on refund).
 */
export async function clawbackMarketing(
  accountId: string,
  transactionId: string,
): Promise<void> {
  let ripllo;
  try {
    ripllo = await marketingClientIfEnabled(accountId);
  } catch {
    return;
  }
  if (!ripllo) return;
  for (const externalRef of [transactionId, `${transactionId}:redeem`]) {
    try {
      await ripllo.loyalty.void({ externalRef, externalSource: 'malapos' });
    } catch (err) {
      console.error('[sell] ripllo loyalty void failed (non-fatal):', {
        transactionId,
        externalRef,
        message: (err as Error).message,
      });
    }
  }
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

  // F&B realtime: voiding a sale that still carried a kitchen ticket clears it
  // off the boards (kds/serve) and refreshes the floor.
  if (txn.kdsState != null) {
    emitFnbChange(accountId, txn.outletId, 'floor');
    emitFnbChange(accountId, txn.outletId, 'kds');
    emitFnbChange(accountId, txn.outletId, 'serve');
  }

  // Claw back any Ripllo loyalty earned/redeemed on this sale (module-on
  // only; best-effort, post-commit).
  await clawbackMarketing(accountId, txn.id);
}
