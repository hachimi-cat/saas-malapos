/*
 * Real-DB smoke for billing + admin CRM. Proves the Plugipay
 * checkout-completed lifecycle (idempotent upsert + outbox), the
 * effectiveTier/limit logic, and the CRM rollup queries against the
 * local Postgres.
 *
 *   tsx scripts/smoke-billing.ts
 *
 * Idempotent: scopes everything to throwaway accountIds and wipes first.
 */
import { prisma } from '../src/lib/db.js';
import { newId } from '../src/lib/ids.js';
import {
  applyCheckoutCompleted,
  effectiveTier,
  checkLimit,
  parseCheckoutMetadata,
  isPaidTier,
} from '../src/lib/billing.js';

const ACC = 'acc_smoke_billing';

async function wipe() {
  await prisma.transactionItem.deleteMany({ where: { accountId: ACC } });
  await prisma.transaction.deleteMany({ where: { accountId: ACC } });
  await prisma.outlet.deleteMany({ where: { accountId: ACC } });
  await prisma.billingSubscription.deleteMany({ where: { accountId: ACC } });
  await prisma.outboxEvent.deleteMany({ where: { accountId: ACC } });
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  await wipe();

  // ── effectiveTier defaults ──
  assert(effectiveTier(null) === 'free', 'no row → free');
  assert(isPaidTier('growth') && !isPaidTier('free'), 'isPaidTier: growth paid, free not');

  // ── parseCheckoutMetadata ──
  assert(parseCheckoutMetadata({ accountId: ACC, tier: 'growth' })?.tier === 'growth', 'parse valid paid metadata');
  assert(parseCheckoutMetadata({ accountId: ACC, tier: 'free' }) === null, 'parse rejects free tier');
  assert(parseCheckoutMetadata({ tier: 'growth' }) === null, 'parse rejects missing accountId');

  // ── applyCheckoutCompleted (idempotent) ──
  const sid = `cs_smoke_${Date.now()}`;
  const r1 = await applyCheckoutCompleted(prisma, { sessionId: sid, accountId: ACC, tier: 'growth' });
  assert(r1 === 'applied', 'first checkout → applied');
  const r2 = await applyCheckoutCompleted(prisma, { sessionId: sid, accountId: ACC, tier: 'growth' });
  assert(r2 === 'duplicate', 'replayed checkout → duplicate (idempotent)');

  const sub = await prisma.billingSubscription.findUnique({ where: { accountId: ACC } });
  assert(sub?.tier === 'growth' && sub.status === 'active', 'subscription is active growth');
  assert(!!sub?.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now(), 'period end in the future');
  assert(effectiveTier(sub) === 'growth', 'effectiveTier reads growth');

  const evt = await prisma.outboxEvent.findFirst({
    where: { accountId: ACC, type: 'malapos.billing.subscribed.v1' },
  });
  assert(!!evt, 'outbox malapos.billing.subscribed.v1 written');

  // ── lapsed + canceled grace ──
  const lapsed = { tier: 'growth', status: 'active', currentPeriodEnd: new Date(Date.now() - 1000) };
  assert(effectiveTier(lapsed) === 'free', 'lapsed period → free');
  const canceledGrace = { tier: 'growth', status: 'canceled', currentPeriodEnd: new Date(Date.now() + 1e9) };
  assert(effectiveTier(canceledGrace) === 'growth', 'canceled within paid period keeps tier');

  // ── checkLimit ──
  assert(checkLimit('free', 'outletLimit', 0).allowed, 'free allows 1st outlet');
  assert(!checkLimit('free', 'outletLimit', 1).allowed, 'free blocks 2nd outlet (cap 1)');
  assert(checkLimit('business', 'outletLimit', 999).allowed, 'business outlets unlimited');
  assert(!checkLimit('free', 'productLimit', 50).allowed, 'free blocks 51st product (cap 50)');

  // ── CRM rollup queries (merchant = accountId grouping) ──
  const outlet = await prisma.outlet.create({
    data: { id: newId('out'), accountId: ACC, name: 'Smoke Outlet', timezone: 'Asia/Jakarta' },
  });
  await prisma.transaction.createMany({
    data: [
      { id: newId('txn'), accountId: ACC, outletId: outlet.id, number: 'INV-1', status: 'COMPLETED', total: 50_000 },
      { id: newId('txn'), accountId: ACC, outletId: outlet.id, number: 'INV-2', status: 'COMPLETED', total: 30_000 },
      { id: newId('txn'), accountId: ACC, outletId: outlet.id, number: 'INV-3', status: 'VOIDED', total: 10_000 },
    ],
  });
  const grouped = await prisma.transaction.groupBy({
    by: ['accountId'],
    where: { accountId: ACC },
    _count: { _all: true },
    _sum: { total: true },
  });
  assert(grouped[0]?._count._all === 3, 'CRM groupBy: 3 sales for the merchant');
  const completedGmv = await prisma.transaction.aggregate({
    _sum: { total: true },
    where: { accountId: ACC, status: 'COMPLETED' },
  });
  assert((completedGmv._sum.total ?? 0) === 80_000, 'CRM GMV (completed only) = Rp 80.000');

  await wipe();
  console.log('\n✅ billing + CRM smoke passed');
}

main()
  .catch((e) => {
    console.error('\n❌', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
