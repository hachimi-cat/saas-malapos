/*
 * Real-DB smoke for the sell flow. Proves catalog → stock → sale → receipt
 * end-to-end against the local Postgres (the skill's "real round trip" eval).
 *
 *   tsx scripts/smoke-sell.ts
 *
 * Idempotent: scopes everything to a throwaway accountId and wipes it first.
 */
import { prisma } from '../src/lib/db.js';
import { newId } from '../src/lib/ids.js';
import { applyMovement } from '../src/lib/inventory.js';
import { createSale, settleParkedSale } from '../src/lib/sell.js';
import { applyOrderPaymentCompleted, parseOrderCheckoutMetadata } from '../src/lib/order-payment.js';

const ACC = 'acc_smoke_malapos';

async function wipe() {
  // Children first (FKs). Scope by accountId everywhere.
  await prisma.loyaltyEntry.deleteMany({ where: { accountId: ACC } });
  await prisma.payment.deleteMany({ where: { accountId: ACC } });
  await prisma.transactionItem.deleteMany({ where: { accountId: ACC } });
  await prisma.transaction.deleteMany({ where: { accountId: ACC } });
  await prisma.stockMovement.deleteMany({ where: { accountId: ACC } });
  await prisma.stockLevel.deleteMany({ where: { accountId: ACC } });
  await prisma.stockBatch.deleteMany({ where: { accountId: ACC } });
  await prisma.productVariant.deleteMany({ where: { accountId: ACC } });
  await prisma.product.deleteMany({ where: { accountId: ACC } });
  await prisma.outlet.deleteMany({ where: { accountId: ACC } });
  await prisma.outboxEvent.deleteMany({ where: { accountId: ACC } });
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  await wipe();

  // Outlet with 11% PPN (exclusive).
  const outlet = await prisma.outlet.create({
    data: { id: newId('out'), accountId: ACC, name: 'Toko Pusat', taxRateBps: 1100 },
  });

  // A tracked product with one variant @ Rp 15.000.
  const product = await prisma.product.create({
    data: {
      id: newId('prd'),
      accountId: ACC,
      name: 'Kopi Susu',
      kind: 'GOODS',
      trackStock: true,
      variants: { create: { id: newId('var'), accountId: ACC, name: 'Default', price: 15000, cost: 8000 } },
    },
    include: { variants: true },
  });
  const variant = product.variants[0]!;

  // Seed 10 in stock via a PURCHASE movement.
  await prisma.$transaction((tx) =>
    applyMovement(tx, {
      accountId: ACC,
      outletId: outlet.id,
      variantId: variant.id,
      type: 'PURCHASE',
      qtyDelta: 10,
      refType: 'seed',
    }),
  );

  // Ring up: 3 × Kopi Susu, paid cash Rp 60.000.
  const saleId = await createSale(
    {
      outletId: outlet.id,
      items: [{ variantId: variant.id, quantity: 3 }],
      payments: [{ method: 'CASH', amount: 49950, tendered: 60000 }],
    },
    { accountId: ACC, cashierSub: 'huudis|smoke', cashierName: 'Smoke Cashier' },
  );

  const sale = await prisma.transaction.findUniqueOrThrow({
    where: { id: saleId },
    include: { items: true, payments: true },
  });
  const level = await prisma.stockLevel.findFirstOrThrow({
    where: { outletId: outlet.id, variantId: variant.id },
  });
  const outbox = await prisma.outboxEvent.findFirst({
    where: { accountId: ACC, type: 'malapos.sale.completed.v1' },
  });

  console.log('\nSell-flow smoke:');
  assert(sale.number === 'INV-000001', `receipt number = ${sale.number}`);
  assert(sale.subtotal === 45000, `subtotal = ${sale.subtotal} (3 × 15.000)`);
  assert(sale.taxTotal === 4950, `tax 11% = ${sale.taxTotal}`);
  assert(sale.total === 49950, `total = ${sale.total}`);
  assert(sale.changeTotal === 10050, `cash change = ${sale.changeTotal}`);
  assert(sale.items.length === 1 && sale.items[0]!.lineTotal === 45000, 'line snapshot correct');
  assert(level.quantity === 7, `stock 10 − 3 = ${level.quantity}`);
  assert(!!outbox, 'malapos.sale.completed.v1 emitted');

  // Void → stock returns.
  const { voidSale } = await import('../src/lib/sell.js');
  await voidSale(ACC, saleId, 'smoke void', 'huudis|smoke');
  const level2 = await prisma.stockLevel.findFirstOrThrow({
    where: { outletId: outlet.id, variantId: variant.id },
  });
  assert(level2.quantity === 10, `void returns stock → ${level2.quantity}`);

  // ─── Dynamic-QRIS parked-sale settle (Payment module) ───────────────
  // Mirrors the QRIS flow: a parked sale with a PENDING QRIS payment is
  // settled by the merchant Plugipay webhook (settleParkedSale) →
  // Payment PAID + Transaction COMPLETED + stock deducted + event.
  console.log('\nQRIS settle smoke:');
  assert(
    parseOrderCheckoutMetadata({ saleAccountId: ACC, saleId: 'txn_x' })?.saleId === 'txn_x',
    'parseOrderCheckoutMetadata reads {saleAccountId, saleId}',
  );
  assert(
    parseOrderCheckoutMetadata({ accountId: ACC, tier: 'growth' }) === null,
    'parseOrderCheckoutMetadata rejects billing metadata (disjoint)',
  );

  const qrisSaleId = await createSale(
    {
      outletId: outlet.id,
      items: [{ variantId: variant.id, quantity: 2 }],
      status: 'PARKED',
      payments: [{ method: 'QRIS', amount: 33300, status: 'PENDING' }],
    },
    { accountId: ACC, cashierSub: 'huudis|smoke', cashierName: 'Smoke Cashier' },
  );
  const parked = await prisma.transaction.findUniqueOrThrow({
    where: { id: qrisSaleId },
    include: { payments: true },
  });
  assert(parked.status === 'PARKED', 'QRIS sale starts PARKED');
  assert(parked.payments[0]!.status === 'PENDING', 'QRIS payment starts PENDING');
  const stockBefore = (
    await prisma.stockLevel.findFirstOrThrow({ where: { outletId: outlet.id, variantId: variant.id } })
  ).quantity;
  assert(stockBefore === 10, 'parked QRIS sale did NOT deduct stock yet');

  // Webhook settle (simulated). The session id matches what
  // POST /payments/qris would have stamped.
  const sessionId = `cs_qris_${Date.now()}`;
  await prisma.payment.update({
    where: { id: parked.payments[0]!.id },
    data: { plugipayCheckoutSessionId: sessionId },
  });
  const r1 = await settleParkedSale({
    accountId: ACC,
    transactionId: qrisSaleId,
    paymentId: parked.payments[0]!.id,
    sessionId,
  });
  assert(r1 === true, 'settleParkedSale → applied');

  const settled = await prisma.transaction.findUniqueOrThrow({
    where: { id: qrisSaleId },
    include: { payments: true },
  });
  assert(settled.status === 'COMPLETED', 'sale flips to COMPLETED');
  assert(!!settled.completedAt, 'completedAt stamped');
  assert(settled.payments[0]!.status === 'PAID', 'QRIS payment flips to PAID');
  assert(settled.paidTotal === 33300, `paidTotal accrues = ${settled.paidTotal}`);
  const stockAfter = (
    await prisma.stockLevel.findFirstOrThrow({ where: { outletId: outlet.id, variantId: variant.id } })
  ).quantity;
  assert(stockAfter === 8, `settle deducts stock 10 − 2 = ${stockAfter}`);
  const qrisEvent = await prisma.outboxEvent.findFirst({
    where: { accountId: ACC, type: 'malapos.sale.completed.v1', aggregateId: qrisSaleId },
  });
  assert(!!qrisEvent, 'malapos.sale.completed.v1 emitted on settle');

  // Idempotent: a webhook replay must not double-deduct.
  const r2 = await settleParkedSale({
    accountId: ACC,
    transactionId: qrisSaleId,
    paymentId: parked.payments[0]!.id,
    sessionId,
  });
  assert(r2 === false, 'replayed settle → duplicate no-op');
  const r3 = await applyOrderPaymentCompleted({ sessionId, accountId: ACC, saleId: qrisSaleId });
  assert(r3.outcome === 'duplicate', 'applyOrderPaymentCompleted on settled sale → duplicate');
  const stockReplay = (
    await prisma.stockLevel.findFirstOrThrow({ where: { outletId: outlet.id, variantId: variant.id } })
  ).quantity;
  assert(stockReplay === 8, 'replay did NOT double-deduct stock');

  await wipe();
  console.log('\n✅ sell-flow smoke PASSED\n');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n❌ smoke FAILED:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
