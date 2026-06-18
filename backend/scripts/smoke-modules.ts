/*
 * Real-HTTP integration smoke across the POS modules. Boots the actual
 * Express app, mints a Huudis BFF session cookie (the production decode
 * path via authConfig.codec), and drives a full pharmacy-style flow:
 * purchase → receive (batch stock-in) → open shift → sale (loyalty earn,
 * FEFO batch deduct) → close shift (cash reconciliation) → reports.
 *
 *   tsx scripts/smoke-modules.ts
 */
import request from 'supertest';
import { createApp } from '../src/app.js';
import { authConfig } from '../src/auth-config.js';
import { prisma } from '../src/lib/db.js';

const ACC = 'acc_smoke_modules';
const app = createApp();
const cookie = `malapos_session=${authConfig.codec.encode({
  accountId: ACC,
  email: 'owner@example.com',
  name: 'Owner',
  huudisSub: 'huudis|owner',
  role: 'merchant',
  huudisAccessToken: 'at_smoke',
  accountIds: [ACC],
})}`;

const api = () => request(app);
const auth = (r: request.Test) => r.set('Cookie', cookie);

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function wipe() {
  for (const t of [
    'loyaltyEntry', 'payment', 'transactionItem', 'transaction', 'stockMovement',
    'stockLevel', 'stockBatch', 'purchaseOrderItem', 'purchaseOrder', 'supplier',
    'shift', 'productVariant', 'product', 'customer', 'outlet', 'posSettings', 'outboxEvent',
  ] as const) {
    // @ts-expect-error dynamic model access for teardown
    await prisma[t].deleteMany({ where: { accountId: ACC } });
  }
}

async function main() {
  await wipe();

  // Outlet (no tax for round numbers).
  let r = await auth(api().post('/api/v1/outlets')).send({ name: 'Apotek Pusat', taxRateBps: 0 });
  assert(r.status === 201, `create outlet → ${r.status}`);
  const outletId = r.body.data.outlet.id as string;

  // Supplier.
  r = await auth(api().post('/api/v1/suppliers')).send({ name: 'PT Distributor Farma' });
  assert(r.status === 201, `create supplier → ${r.status}`);
  const supplierId = r.body.data.supplier.id as string;

  // Pharmacy product (batch-tracked) with one variant @ Rp 5.000.
  r = await auth(api().post('/api/v1/products')).send({
    name: 'Paracetamol 500mg',
    kind: 'GOODS',
    trackStock: true,
    requiresBatch: true,
    variants: [{ name: 'Strip', price: 5000, cost: 3000, barcode: '8990001' }],
  });
  assert(r.status === 201, `create product → ${r.status}`);
  const variantId = r.body.data.product.variants[0].id as string;

  // Purchase order: 100 strips @ cost 3.000, batch B1 exp 2027-01-01.
  r = await auth(api().post('/api/v1/purchase-orders')).send({
    outletId,
    supplierId,
    items: [{ variantId, quantity: 100, cost: 3000, batchNo: 'B1', expiryDate: '2027-01-01' }],
  });
  assert(r.status === 201, `create PO → ${r.status}`);
  const po = r.body.data.purchaseOrder ?? r.body.data.po ?? r.body.data;
  const poId = po.id as string;
  assert(po.number === 'PO-000001', `PO number = ${po.number}`);
  assert(po.total === 300000, `PO total = ${po.total} (100 × 3.000)`);
  const poItemId = po.items[0].id as string;

  await auth(api().post(`/api/v1/purchase-orders/${poId}/order`)).send({});
  r = await auth(api().post(`/api/v1/purchase-orders/${poId}/receive`)).send({
    items: [{ itemId: poItemId, receivedQty: 100, batchNo: 'B1', expiryDate: '2027-01-01' }],
  });
  assert(r.status === 200, `receive PO → ${r.status}`);
  const received = r.body.data.purchaseOrder ?? r.body.data.po ?? r.body.data;
  assert(received.status === 'RECEIVED', `PO status = ${received.status}`);

  // Stock should now be 100.
  r = await auth(api().get(`/api/v1/inventory/levels?outletId=${outletId}`));
  const lvl = r.body.data.levels.find((l: { variantId: string }) => l.variantId === variantId);
  assert(lvl?.quantity === 100, `stock after receive = ${lvl?.quantity}`);

  // Open a shift with Rp 100.000 float.
  r = await auth(api().post('/api/v1/shifts/open')).send({ outletId, openingFloat: 100000 });
  assert(r.status === 201, `open shift → ${r.status}`);
  const shiftId = r.body.data.shift.id as string;

  // Customer.
  r = await auth(api().post('/api/v1/customers')).send({ name: 'Budi', phone: '0812' });
  const customerId = r.body.data.customer.id as string;

  // Sale: 2 strips = Rp 10.000, cash exact, linked to shift + customer.
  r = await auth(api().post('/api/v1/sales')).send({
    outletId,
    shiftId,
    customerId,
    items: [{ variantId, quantity: 2 }],
    payments: [{ method: 'CASH', amount: 10000, tendered: 10000 }],
  });
  assert(r.status === 201, `sale → ${r.status}`);
  assert(r.body.data.sale.total === 10000, `sale total = ${r.body.data.sale.total}`);

  // Stock 100 − 2 = 98; FEFO drew from batch B1.
  r = await auth(api().get(`/api/v1/inventory/levels?outletId=${outletId}`));
  const lvl2 = r.body.data.levels.find((l: { variantId: string }) => l.variantId === variantId);
  assert(lvl2?.quantity === 98, `stock after sale = ${lvl2?.quantity}`);
  r = await auth(api().get(`/api/v1/inventory/batches?outletId=${outletId}&variantId=${variantId}`));
  assert(r.body.data.batches[0]?.qtyRemaining === 98, `batch B1 remaining = ${r.body.data.batches[0]?.qtyRemaining}`);

  // Loyalty earned: floor(10000 / 1000) = 10.
  r = await auth(api().get(`/api/v1/customers/${customerId}`));
  assert(r.body.data.customer.loyaltyPoints === 10, `loyalty earned = ${r.body.data.customer.loyaltyPoints}`);

  // Close shift: float 100.000 + cash sale 10.000 = expected 110.000.
  r = await auth(api().post(`/api/v1/shifts/${shiftId}/close`)).send({ countedCash: 110000 });
  assert(r.status === 200, `close shift → ${r.status}`);
  assert(r.body.data.shift.expectedCash === 110000, `expected cash = ${r.body.data.shift.expectedCash}`);
  assert(r.body.data.shift.cashDifference === 0, `cash difference = ${r.body.data.shift.cashDifference}`);

  // Reports summary: 1 sale, gross 10.000.
  r = await auth(api().get('/api/v1/reports/summary'));
  assert(r.body.data.salesCount === 1, `report salesCount = ${r.body.data.salesCount}`);
  assert(r.body.data.gross === 10000, `report gross = ${r.body.data.gross}`);

  await wipe();
  console.log('\n✅ modules integration smoke PASSED\n');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n❌ smoke FAILED:', e.message, e.stack);
  await prisma.$disconnect();
  process.exit(1);
});
