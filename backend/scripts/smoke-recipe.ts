/*
 * Real-DB smoke for composite items / bill-of-materials (recipes, bundles,
 * compounding, break-bulk). Proves: selling a COMPOSITE deducts its components
 * (qty × soldQty) through the ledger, the composite itself tracks no stock,
 * and voiding returns the components.
 *
 *   tsx scripts/smoke-recipe.ts
 *
 * Idempotent: scopes everything to a throwaway accountId and wipes it first.
 */
import { prisma } from '../src/lib/db.js';
import { newId } from '../src/lib/ids.js';
import { applyMovement, compositeAvailable } from '../src/lib/inventory.js';
import { createSale, voidSale } from '../src/lib/sell.js';

const ACC = 'acc_smoke_malapos_recipe';

async function wipe() {
  await prisma.payment.deleteMany({ where: { accountId: ACC } });
  await prisma.transactionItem.deleteMany({ where: { accountId: ACC } });
  await prisma.transaction.deleteMany({ where: { accountId: ACC } });
  await prisma.stockMovement.deleteMany({ where: { accountId: ACC } });
  await prisma.stockLevel.deleteMany({ where: { accountId: ACC } });
  await prisma.stockBatch.deleteMany({ where: { accountId: ACC } });
  await prisma.recipeComponent.deleteMany({ where: { accountId: ACC } });
  await prisma.productVariant.deleteMany({ where: { accountId: ACC } });
  await prisma.product.deleteMany({ where: { accountId: ACC } });
  await prisma.outlet.deleteMany({ where: { accountId: ACC } });
  await prisma.outboxEvent.deleteMany({ where: { accountId: ACC } });
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function seedComponent(
  outletId: string,
  productName: string,
  price: number,
  startQty: number,
) {
  const product = await prisma.product.create({
    data: {
      id: newId('prd'),
      accountId: ACC,
      name: productName,
      kind: 'GOODS',
      trackStock: true,
      variants: { create: { id: newId('var'), accountId: ACC, name: 'Default', price, cost: 0 } },
    },
    include: { variants: true },
  });
  const variant = product.variants[0]!;
  await prisma.$transaction((tx) =>
    applyMovement(tx, {
      accountId: ACC,
      outletId,
      variantId: variant.id,
      type: 'PURCHASE',
      qtyDelta: startQty,
      refType: 'seed',
    }),
  );
  return variant;
}

async function main() {
  await wipe();

  const outlet = await prisma.outlet.create({
    data: { id: newId('out'), accountId: ACC, name: 'Toko Pusat', taxRateBps: 0 },
  });

  // Components:
  //  - Coffee beans, 100 in stock (whole units)
  //  - Box of 100 tablets, 5 boxes in stock (break-bulk via decimal)
  const beans = await seedComponent(outlet.id, 'Coffee Beans', 0, 100);
  const tabletBox = await seedComponent(outlet.id, 'Paracetamol Box of 100', 0, 5);

  // Composite "Kopi Susu" = 2 beans + 0.01 box (1 tablet) per cup, priced 18.000.
  const composite = await prisma.product.create({
    data: {
      id: newId('prd'),
      accountId: ACC,
      name: 'Kopi Susu Komplit',
      kind: 'GOODS',
      trackStock: false, // composite carries no stock of its own
      variants: {
        create: {
          id: newId('var'),
          accountId: ACC,
          name: 'Default',
          price: 18000,
          cost: 0,
          isComposite: true,
        },
      },
    },
    include: { variants: true },
  });
  const compVariant = composite.variants[0]!;

  await prisma.recipeComponent.createMany({
    data: [
      { id: newId('rcp'), accountId: ACC, parentVariantId: compVariant.id, componentVariantId: beans.id, quantity: 2, unit: 'scoop' },
      { id: newId('rcp'), accountId: ACC, parentVariantId: compVariant.id, componentVariantId: tabletBox.id, quantity: 0.01, unit: 'box' },
    ],
  });

  console.log('\nComposite-item smoke:');

  // Availability: beans 100/2 = 50, boxes 5/0.01 = 500 → min = 50.
  const avail = await compositeAvailable(ACC, outlet.id, compVariant.id);
  assert(avail === 50, `compositeAvailable = ${avail} (min(floor(100/2), floor(5/0.01)) = 50)`);

  // Sell 3 cups.
  const saleId = await createSale(
    {
      outletId: outlet.id,
      items: [{ variantId: compVariant.id, quantity: 3 }],
      payments: [{ method: 'CASH', amount: 54000, tendered: 54000 }],
    },
    { accountId: ACC, cashierSub: 'huudis|smoke', cashierName: 'Smoke' },
  );

  const beansLevel = await prisma.stockLevel.findFirstOrThrow({
    where: { outletId: outlet.id, variantId: beans.id },
  });
  const boxLevel = await prisma.stockLevel.findFirstOrThrow({
    where: { outletId: outlet.id, variantId: tabletBox.id },
  });
  const compLevel = await prisma.stockLevel.findFirst({
    where: { outletId: outlet.id, variantId: compVariant.id },
  });

  assert(beansLevel.quantity === 100 - 2 * 3, `beans 100 − (2 × 3) = ${beansLevel.quantity}`);
  // 5 − (0.01 × 3) = 4.97 — fractional break-bulk deduction.
  assert(
    Math.abs(boxLevel.quantity - (5 - 0.01 * 3)) < 1e-9,
    `tablet box 5 − (0.01 × 3) = ${boxLevel.quantity}`,
  );
  assert(compLevel === null, 'composite itself has NO StockLevel row');

  // Movements recorded against components with refType 'recipe'.
  const recipeMovements = await prisma.stockMovement.findMany({
    where: { accountId: ACC, refType: 'recipe', refId: saleId },
  });
  assert(recipeMovements.length === 2, `2 component SALE movements (refType=recipe) recorded`);
  assert(
    recipeMovements.every((m) => m.type === 'SALE' && m.qtyDelta < 0),
    'component movements are SALE with negative qty',
  );

  // Void → components returned.
  await voidSale(ACC, saleId, 'smoke void', 'huudis|smoke');
  const beansLevel2 = await prisma.stockLevel.findFirstOrThrow({
    where: { outletId: outlet.id, variantId: beans.id },
  });
  const boxLevel2 = await prisma.stockLevel.findFirstOrThrow({
    where: { outletId: outlet.id, variantId: tabletBox.id },
  });
  assert(beansLevel2.quantity === 100, `void returns beans → ${beansLevel2.quantity}`);
  assert(Math.abs(boxLevel2.quantity - 5) < 1e-9, `void returns tablet box → ${boxLevel2.quantity}`);

  const returnMovements = await prisma.stockMovement.findMany({
    where: { accountId: ACC, refType: 'recipe', refId: saleId, type: 'RETURN' },
  });
  assert(returnMovements.length === 2, '2 component RETURN movements on void');

  await wipe();
  console.log('\n✅ composite-item smoke PASSED\n');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n❌ smoke FAILED:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
