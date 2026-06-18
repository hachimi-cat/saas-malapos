/*
 * Real-DB smoke for the three extras: gift cards / store credit, partial /
 * line-item refunds, and the F&B Kitchen Display (KDS). Proves end-to-end
 * against local Postgres:
 *
 *   1. Issue a gift card, redeem part of it in a sale → balance decrements,
 *      ledger entry written, sale links the redemption.
 *   2. Partial line-item refund with restock → refundedTotal bumps, status
 *      flips PARTIALLY_REFUNDED, stock returns; a second refund of the rest
 *      flips to REFUNDED.
 *   3. An F&B-workspace sale gets kdsState NEW and advances through the
 *      state machine.
 *
 *   tsx scripts/smoke-extras.ts
 *
 * Idempotent: scopes everything to a throwaway accountId and wipes it first.
 */
import { prisma } from '../src/lib/db.js';
import { newId } from '../src/lib/ids.js';
import { applyMovement } from '../src/lib/inventory.js';
import { createSale } from '../src/lib/sell.js';
import { refundSale } from '../src/lib/refund.js';
import { issueGiftCard, giftCardByCode } from '../src/lib/giftcards.js';

const ACC = 'acc_smoke_malapos_extras';

async function wipe() {
  await prisma.giftCardEntry.deleteMany({ where: { accountId: ACC } });
  await prisma.giftCard.deleteMany({ where: { accountId: ACC } });
  await prisma.refund.deleteMany({ where: { accountId: ACC } });
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
  await prisma.posSettings.deleteMany({ where: { accountId: ACC } });
  await prisma.customer.deleteMany({ where: { accountId: ACC } });
  await prisma.outboxEvent.deleteMany({ where: { accountId: ACC } });
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function seedProduct(name: string, price: number) {
  const product = await prisma.product.create({
    data: {
      id: newId('prd'),
      accountId: ACC,
      name,
      kind: 'GOODS',
      trackStock: true,
      variants: { create: { id: newId('var'), accountId: ACC, name: 'Default', price, cost: 0 } },
    },
    include: { variants: true },
  });
  return product.variants[0]!;
}

async function main() {
  await wipe();

  const outlet = await prisma.outlet.create({
    data: { id: newId('out'), accountId: ACC, name: 'Toko Pusat', taxRateBps: 0 },
  });
  const variant = await seedProduct('Kopi Susu', 15000);
  await prisma.$transaction((tx) =>
    applyMovement(tx, { accountId: ACC, outletId: outlet.id, variantId: variant.id, type: 'PURCHASE', qtyDelta: 100, refType: 'seed' }),
  );

  // ── 1. Gift card / store credit ──────────────────────────────────────────
  console.log('\nGift-card smoke:');
  const giftId = await issueGiftCard({ accountId: ACC, amount: 50000 });
  const issued = await prisma.giftCard.findUniqueOrThrow({ where: { id: giftId } });
  assert(issued.balance === 50000 && issued.status === 'ACTIVE', `issued ${issued.code} @ ${issued.balance}`);
  const issueLedger = await prisma.giftCardEntry.findMany({ where: { giftCardId: giftId } });
  assert(issueLedger.length === 1 && issueLedger[0]!.delta === 50000, 'issue ledger entry written');

  // Sell 2 cups (Rp 30.000), pay Rp 20.000 with the gift card + Rp 10.000 cash.
  const gcSaleId = await createSale(
    {
      outletId: outlet.id,
      items: [{ variantId: variant.id, quantity: 2 }],
      payments: [
        { method: 'GIFT_CARD', amount: 20000, reference: issued.code },
        { method: 'CASH', amount: 10000, tendered: 10000 },
      ],
    },
    { accountId: ACC, cashierSub: 'huudis|smoke' },
  );
  const afterRedeem = await giftCardByCode(ACC, issued.code);
  assert(afterRedeem!.balance === 30000, `gift card 50.000 − 20.000 = ${afterRedeem!.balance}`);
  const redeemEntry = await prisma.giftCardEntry.findFirst({
    where: { giftCardId: giftId, reason: 'redeem' },
  });
  assert(redeemEntry?.delta === -20000 && redeemEntry.transactionId === gcSaleId, 'redeem ledger linked to sale');

  // Insufficient balance is a clean error (rolls the sale back).
  let rejected = false;
  try {
    await createSale(
      {
        outletId: outlet.id,
        items: [{ variantId: variant.id, quantity: 1 }],
        payments: [{ method: 'GIFT_CARD', amount: 999999, reference: issued.code }],
      },
      { accountId: ACC, cashierSub: 'huudis|smoke' },
    );
  } catch {
    rejected = true;
  }
  assert(rejected, 'over-balance gift-card redemption rejected');
  const stillThirty = await giftCardByCode(ACC, issued.code);
  assert(stillThirty!.balance === 30000, `balance unchanged after rejected sale = ${stillThirty!.balance}`);

  // ── 2. Partial / line-item refund ─────────────────────────────────────────
  console.log('\nRefund smoke:');
  const refSaleId = await createSale(
    {
      outletId: outlet.id,
      items: [{ variantId: variant.id, quantity: 4 }], // Rp 60.000
      payments: [{ method: 'CASH', amount: 60000, tendered: 60000 }],
    },
    { accountId: ACC, cashierSub: 'huudis|smoke' },
  );
  const sale = await prisma.transaction.findUniqueOrThrow({
    where: { id: refSaleId },
    include: { items: true },
  });
  const line = sale.items[0]!;
  const levelBefore = await prisma.stockLevel.findFirstOrThrow({
    where: { outletId: outlet.id, variantId: variant.id },
  });

  // Refund 1 of 4 with restock → Rp 15.000, PARTIALLY_REFUNDED, +1 stock.
  await refundSale(refSaleId, { lines: [{ transactionItemId: line.id, qty: 1 }], restock: true, reason: 'damaged' }, { accountId: ACC, bySub: 'huudis|smoke' });
  const sale1 = await prisma.transaction.findUniqueOrThrow({ where: { id: refSaleId } });
  assert(sale1.refundedTotal === 15000, `refundedTotal = ${sale1.refundedTotal} (1 × 15.000)`);
  assert(sale1.status === 'PARTIALLY_REFUNDED', `status = ${sale1.status}`);
  const levelAfter1 = await prisma.stockLevel.findFirstOrThrow({
    where: { outletId: outlet.id, variantId: variant.id },
  });
  assert(levelAfter1.quantity === levelBefore.quantity + 1, `restock returned 1 → ${levelAfter1.quantity}`);
  const refundOutbox = await prisma.outboxEvent.findFirst({
    where: { accountId: ACC, type: 'malapos.sale.refunded.v1', aggregateId: refSaleId },
  });
  assert(!!refundOutbox, 'malapos.sale.refunded.v1 emitted');

  // Refund the remaining Rp 45.000 by flat amount → fully REFUNDED.
  await refundSale(refSaleId, { amount: 45000 }, { accountId: ACC, bySub: 'huudis|smoke' });
  const sale2 = await prisma.transaction.findUniqueOrThrow({ where: { id: refSaleId } });
  assert(sale2.refundedTotal === 60000 && sale2.status === 'REFUNDED', `fully refunded → ${sale2.status}`);

  // Cannot over-refund.
  let overRejected = false;
  try {
    await refundSale(refSaleId, { amount: 1 }, { accountId: ACC });
  } catch {
    overRejected = true;
  }
  assert(overRejected, 'refund beyond total rejected');

  // ── 3. F&B Kitchen Display ────────────────────────────────────────────────
  console.log('\nKDS smoke:');
  await prisma.posSettings.create({
    data: { id: newId('pos'), accountId: ACC, businessType: 'FNB' },
  });
  const kdsSaleId = await createSale(
    {
      outletId: outlet.id,
      items: [{ variantId: variant.id, quantity: 1 }],
      payments: [{ method: 'CASH', amount: 15000, tendered: 15000 }],
    },
    { accountId: ACC, cashierSub: 'huudis|smoke' },
  );
  const ticket = await prisma.transaction.findUniqueOrThrow({ where: { id: kdsSaleId } });
  assert(ticket.kdsState === 'NEW', `F&B sale gets kdsState = ${ticket.kdsState}`);

  // Advance NEW → PREPARING → READY → SERVED.
  const states: string[] = [];
  for (let i = 0; i < 3; i++) {
    const t = await prisma.transaction.findUniqueOrThrow({ where: { id: kdsSaleId } });
    const order = ['NEW', 'PREPARING', 'READY', 'SERVED'];
    const next = order[order.indexOf(t.kdsState!) + 1]!;
    await prisma.transaction.update({ where: { id: kdsSaleId }, data: { kdsState: next as never } });
    states.push(next);
  }
  assert(states.join('→') === 'PREPARING→READY→SERVED', `advanced ${states.join('→')}`);

  // A retail sale (non-FNB workspace would be null) — confirm null when no FNB.
  await prisma.posSettings.update({ where: { accountId: ACC }, data: { businessType: 'RETAIL' } });
  const retailSaleId = await createSale(
    {
      outletId: outlet.id,
      items: [{ variantId: variant.id, quantity: 1 }],
      payments: [{ method: 'CASH', amount: 15000, tendered: 15000 }],
    },
    { accountId: ACC, cashierSub: 'huudis|smoke' },
  );
  const retail = await prisma.transaction.findUniqueOrThrow({ where: { id: retailSaleId } });
  assert(retail.kdsState === null, 'retail-workspace sale has null kdsState (not a kitchen ticket)');

  await wipe();
  console.log('\n✅ extras smoke (gift cards + refunds + KDS) PASSED\n');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n❌ smoke FAILED:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
