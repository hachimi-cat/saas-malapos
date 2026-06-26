import { prisma } from './db.js';

/*
 * Merchant-order (QRIS) payment apply step for the Plugipay checkout
 * webhook — the POS sibling of lib/billing.ts applyCheckoutCompleted.
 *
 * The Payment module's dynamic QRIS flow parks a sale (status PARKED)
 * with a PENDING QRIS payment carrying the minted Plugipay
 * checkout-session id (routes/payments.ts POST /payments/qris). When the
 * customer scans + pays, the merchant's Plugipay workspace emits
 * `plugipay.checkout_session.completed.v1` with {saleAccountId, saleId}
 * metadata; this step flips the matching Payment → PAID and settles the
 * Transaction → COMPLETED (stock deduction + loyalty + outbox, via the
 * shared lib/sell.ts settle step).
 *
 * Idempotent: an already-PAID payment / non-PARKED transaction is a
 * 'duplicate' no-op — Plugipay retries deliveries and the same session
 * must never double-settle.
 */

/** Parse + validate the metadata stamped onto a merchant-order QRIS
 *  checkout session (routes/payments.ts). Returns null unless it names
 *  BOTH the malapos workspace and the sale. Note: tier-billing sessions
 *  carry {accountId, tier} instead — disjoint metadata, so the billing
 *  branch (lib/billing.ts parseCheckoutMetadata) is tried first. */
export function parseOrderCheckoutMetadata(
  metadata: Record<string, unknown> | null | undefined,
): { accountId: string; saleId: string } | null {
  const md = metadata ?? {};
  const accountId = typeof md.saleAccountId === 'string' ? md.saleAccountId.trim() : '';
  const saleId = typeof md.saleId === 'string' ? md.saleId.trim() : '';
  if (!accountId || !saleId) return null;
  return { accountId, saleId };
}

export interface AppliedOrderPayment {
  outcome: 'applied' | 'duplicate' | 'not_found';
  transactionId?: string;
}

/**
 * Webhook apply step for plugipay.checkout_session.completed.v1 with
 * merchant-order metadata. Settle semantics: a PARKED transaction whose
 * QRIS payment is PENDING → mark the payment PAID + settle the sale
 * (lib/sell.ts settleParkedSale: stock deduction + loyalty + the
 * malapos.sale.completed.v1 outbox event, all in one transaction). An
 * already-settled (non-PARKED) sale is a 'duplicate' no-op.
 *
 * Lives outside the settle transaction's own module to keep the import
 * graph acyclic; delegates the heavy lifting to lib/sell.ts.
 */
export async function applyOrderPaymentCompleted(input: {
  sessionId: string;
  accountId: string;
  saleId: string;
}): Promise<AppliedOrderPayment> {
  // Locate the parked sale + its QRIS payment for this session. Match on
  // the stored session id first (the precise key); fall back to the
  // (accountId, saleId) pair so a payment created before the session id
  // was persisted still settles.
  const txn = await prisma.transaction.findFirst({
    where: { id: input.saleId, accountId: input.accountId },
    select: { id: true, status: true },
  });
  if (!txn) return { outcome: 'not_found' };
  if (txn.status !== 'PARKED') {
    // Already settled / voided — webhook retry or double delivery.
    return { outcome: 'duplicate', transactionId: txn.id };
  }

  const payment = await prisma.payment.findFirst({
    where: {
      transactionId: txn.id,
      // Plugipay-processed checkout tenders: dynamic QRIS or VA. Both park a
      // PENDING payment and settle through this same completed-session webhook.
      method: { in: ['QRIS', 'VA'] },
      OR: [
        { plugipayCheckoutSessionId: input.sessionId },
        { status: 'PENDING' },
      ],
    },
    select: { id: true },
  });
  if (!payment) return { outcome: 'not_found', transactionId: txn.id };

  // Delegate the settle (mark payment PAID + deduct stock + loyalty +
  // outbox, one transaction). Dynamic import avoids a sell.ts ⇄
  // order-payment.ts import cycle.
  const { settleParkedSale } = await import('./sell.js');
  const settled = await settleParkedSale({
    accountId: input.accountId,
    transactionId: txn.id,
    paymentId: payment.id,
    sessionId: input.sessionId,
  });
  return { outcome: settled ? 'applied' : 'duplicate', transactionId: txn.id };
}
