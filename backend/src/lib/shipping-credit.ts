import { prisma } from './db.js';
import { writeOutbox } from './outbox.js';
import { fulkrumaForMerchant } from '../services/fulkruma-module-service.js';

/*
 * Shipping-credit top-up apply step — credits a merchant's Fulkruma
 * prepaid courier balance after the Plugipay top-up checkout completes
 * (routes/fulfillment/shipping-credits.ts POST /topup). Fulkruma owns the
 * BALANCE + LEDGER (the dashboard reads them live over the gated
 * per-merchant client, requireMerchantClient); Malapos keeps NO local
 * credit table — same stance as the rest of the fulfillment proxy. The
 * only Malapos-side state is the top-up PAYMENT: the merchant buys credit
 * through a Plugipay hosted checkout on Malapos's OWN billing workspace
 * (lib/plugipay.ts getPlugipayClient, same client as tier billing), and
 * when that checkout completes this step credits the Fulkruma balance.
 *
 * METADATA CONVENTION: the top-up checkout is stamped
 * { shippingCreditTopup: 'true', malaposAccountId, fulkrumaAccountId,
 * requestedAmount }. Because it rides Malapos's own billing workspace,
 * the webhook verifies it with env PLUGIPAY_WEBHOOK_SECRET (the same
 * secret as tier billing — branch 1 of routes/webhooks-plugipay.ts), NOT
 * a per-merchant secret.
 *
 * IDEMPOTENCY (ADR-0006): Plugipay retries deliveries, so the same
 * checkout session must never credit twice. Two layers:
 *   1. A ProcessedEvent row keyed `shipcredit:<sessionId>` — the local
 *      consumer-side guard. Checked up-front, written transactionally
 *      with the outbox announce AFTER the topUp.
 *   2. The Fulkruma topUp carries externalRef = the session id, so even
 *      a racing duplicate that slips past the local guard can't
 *      double-credit — Fulkruma dedups on externalRef.
 */

export interface ShippingCreditTopupMeta {
  accountId: string;
  fulkrumaAccountId: string;
  amount: number;
}

/** Parse + validate the metadata stamped onto a shipping-credit top-up
 *  checkout (routes/fulfillment/shipping-credits.ts). Returns null unless
 *  the marker is set AND it names a Malapos workspace, a Fulkruma account,
 *  and a positive integer amount. NOTE: the workspace id rides as
 *  `malaposAccountId` (Malapos's own-workspace convention) — distinct from
 *  the `accountId` tier-billing key, so the parsers don't collide. */
export function parseShippingCreditTopupMetadata(
  metadata: Record<string, unknown> | null | undefined,
): ShippingCreditTopupMeta | null {
  const md = metadata ?? {};
  if (md.shippingCreditTopup !== 'true') return null;
  const accountId = typeof md.malaposAccountId === 'string' ? md.malaposAccountId.trim() : '';
  const fulkrumaAccountId =
    typeof md.fulkrumaAccountId === 'string' ? md.fulkrumaAccountId.trim() : '';
  const amount = Number(md.requestedAmount);
  if (!accountId || !fulkrumaAccountId || !Number.isInteger(amount) || amount <= 0) return null;
  return { accountId, fulkrumaAccountId, amount };
}

/** Webhook apply step for a completed shipping-credit top-up checkout.
 *
 *  'duplicate'  — already credited (local guard hit).
 *  'module_off' — the merchant turned Fulfillment off / re-provisioned a
 *                 different Fulkruma workspace after paying; we do NOT
 *                 credit a stale/disabled workspace (logged, acked).
 *  'applied'    — Fulkruma balance credited + announced.
 */
export async function applyShippingCreditTopup(input: {
  sessionId: string;
  accountId: string;
  fulkrumaAccountId: string;
  amount: number;
}): Promise<'applied' | 'duplicate' | 'module_off'> {
  const processedKey = `shipcredit:${input.sessionId}`;

  // Layer 1 — fast local idempotency guard.
  const seen = await prisma.processedEvent.findUnique({ where: { eventId: processedKey } });
  if (seen) return 'duplicate';

  // Re-gate: the merchant must still have Fulfillment on, with the SAME
  // Fulkruma workspace the checkout was stamped for.
  const row = await prisma.posSettings.findUnique({
    where: { accountId: input.accountId },
    select: { modulesEnabled: true, fulkrumaAccountId: true },
  });
  const modules = (row?.modulesEnabled as { fulfillment?: boolean } | null) ?? {};
  if (!row || modules.fulfillment !== true || row.fulkrumaAccountId !== input.fulkrumaAccountId) {
    return 'module_off';
  }

  // Credit the merchant's Fulkruma balance. externalRef = the checkout
  // session id is Layer 2 of the idempotency — Fulkruma dedups on it.
  const client = fulkrumaForMerchant(input.fulkrumaAccountId);
  await client.shippingCredits.topUp({
    amount: input.amount,
    externalRef: input.sessionId,
    memo: 'Plugipay top-up',
  });

  // Record the processed event + announce the credit, transactionally.
  // A PK clash means a concurrent delivery already recorded it (and
  // Fulkruma dedup'd the topUp) — swallow it as a duplicate.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.processedEvent.create({ data: { eventId: processedKey } });
      await writeOutbox(tx, {
        type: 'malapos.shipping_credit.topped_up.v1',
        accountId: input.accountId,
        aggregateId: input.fulkrumaAccountId,
        data: {
          plugipayCheckoutSessionId: input.sessionId,
          fulkrumaAccountId: input.fulkrumaAccountId,
          amount: input.amount,
        },
      });
    });
  } catch {
    return 'duplicate';
  }
  return 'applied';
}
