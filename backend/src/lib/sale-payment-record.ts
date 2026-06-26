import type { PlugipayClient } from '@forjio/plugipay-node';
import { prisma } from './db.js';
import { paymentClientIfEnabled } from '../services/plugipay-module-service.js';

/*
 * Per-sale recording into the Payment (Plugipay) module.
 *
 * When a merchant has the Payments module ON, a dynamic QRIS / VA sale already
 * produces a record in their Plugipay workspace: routes/payments.ts mints a
 * checkout session, the customer pays, and Plugipay emits a RECEIPT for the
 * completed session (sourceType='checkout_session') — that's how those sales
 * surface in /dashboard/payments/receipts. But a sale settled at the counter
 * with cash / card / transfer / gift-card never touched Plugipay, so it never
 * appeared there.
 *
 * This module closes that gap: on completion of ANY non-checkout sale (module
 * ON), it records ONE PAID Plugipay invoice carrying the sale's line items.
 * Paying the invoice makes Plugipay issue a receipt (sourceType='invoice'), so
 * the sale shows up in BOTH the payment module's invoices AND receipts views —
 * a superset of what the QRIS flow produces. (QRIS / VA sales are deliberately
 * NOT invoiced here — they're already recorded as a checkout session; this
 * recorder is never called from the checkout-settle path, and the
 * `viaCheckout` guard below is belt-and-suspenders.)
 *
 * Contract (mirrors the Ripllo loyalty post-commit stamping in lib/sell.ts):
 *   - BEST-EFFORT + NON-FATAL. The sale is already durably committed before
 *     this runs; a Plugipay hiccup must never surface as a failed sale. Every
 *     failure is swallowed + logged.
 *   - MODULE-GATED. `paymentClientIfEnabled` returns null when the module is
 *     off / no PLUGIPAY_* env / no merchant workspace → we do nothing, so
 *     module-off POS behaves exactly as before with ZERO Plugipay calls.
 *   - IDEMPOTENT. Transaction.plugipayInvoiceId is the guard: a sale that
 *     already carries an invoice id is skipped, and the id is stamped with a
 *     conditional updateMany (where plugipayInvoiceId IS NULL) so a retry /
 *     double-invocation can never create two invoices for one sale.
 */

const INVOICE_CURRENCY = 'IDR';

interface ModifierSnapshot {
  name?: string;
  price?: number;
}

/** Sum the per-unit modifier surcharges stored on a TransactionItem.modifiers
 *  JSON blob ([{ name, price }]). Defensive against legacy / malformed rows. */
function modifiersPerUnit(modifiers: unknown): number {
  if (!Array.isArray(modifiers)) return 0;
  return (modifiers as ModifierSnapshot[]).reduce(
    (sum, m) => sum + (typeof m?.price === 'number' ? Math.max(0, m.price) : 0),
    0,
  );
}

/** Resolve (lazily minting once) the merchant's generic "POS Walk-in" Plugipay
 *  customer — invoices REQUIRE a customerId, but counter sales are usually
 *  anonymous. Stored on PosSettings.plugipayPosCustomerId. Returns null on any
 *  failure (caller treats the whole record as best-effort). */
async function ensurePosCustomer(
  client: PlugipayClient,
  accountId: string,
): Promise<string | null> {
  const row = await prisma.posSettings.findUnique({
    where: { accountId },
    select: { plugipayPosCustomerId: true, businessName: true },
  });
  if (row?.plugipayPosCustomerId) return row.plugipayPosCustomerId;

  const customer = await client.customers.create({
    name: row?.businessName ? `${row.businessName} — POS Walk-in` : 'POS Walk-in',
    externalId: `malapos:pos:${accountId}`,
  });
  // Conditional set so a concurrent first-sale race doesn't clobber a winner;
  // re-read to use whichever id actually landed.
  await prisma.posSettings.updateMany({
    where: { accountId, plugipayPosCustomerId: null },
    data: { plugipayPosCustomerId: customer.id },
  });
  const after = await prisma.posSettings.findUnique({
    where: { accountId },
    select: { plugipayPosCustomerId: true },
  });
  return after?.plugipayPosCustomerId ?? customer.id;
}

/**
 * Record a completed sale into the Payment module as one PAID invoice (→ which
 * yields a receipt). Best-effort + idempotent (see module header). Safe to call
 * for every completion path; it self-gates on the module being on and on the
 * sale being a COMPLETED non-checkout sale that hasn't been recorded yet.
 */
export async function recordSaleToPaymentModule(
  accountId: string,
  transactionId: string,
): Promise<void> {
  let client: PlugipayClient | null;
  try {
    client = await paymentClientIfEnabled(accountId);
  } catch {
    return; // module probe failed → treat as off
  }
  if (!client) return; // module OFF / no env / no workspace → nothing to do

  try {
    const txn = await prisma.transaction.findFirst({
      where: { id: transactionId, accountId },
      include: {
        outlet: { select: { taxInclusive: true } },
        items: true,
        payments: { select: { plugipayCheckoutSessionId: true } },
      },
    });
    if (!txn) return;
    if (txn.status !== 'COMPLETED') return; // only record settled sales
    if (txn.plugipayInvoiceId) return; // already recorded — idempotent skip
    if (!txn.items.length) return;

    // A sale settled through a Plugipay checkout session (dynamic QRIS / VA)
    // is already recorded as a checkout receipt — never double-record it as an
    // invoice. (The checkout-settle path doesn't call this recorder; this is
    // the belt-and-suspenders.)
    if (txn.payments.some((p) => p.plugipayCheckoutSessionId)) return;

    const customerId = await ensurePosCustomer(client, accountId);
    if (!customerId) return;

    // One invoice line per sale line. unitAmount = unit price + per-unit
    // modifier surcharge; the line amount Plugipay computes is therefore
    // (unitPrice + modifiers) × qty = the line's pre-discount value.
    const lines = txn.items.map((it) => {
      const unitAmount = it.unitPrice + modifiersPerUnit(it.modifiers);
      const label = [it.productName, it.variantName].filter(Boolean).join(' — ');
      return {
        description: label || it.productName || 'Item',
        quantity: it.quantity,
        unitAmount,
      };
    });
    const linesSum = lines.reduce((s, l) => s + l.unitAmount * l.quantity, 0);

    // Force the invoice total to equal the sale total EXACTLY, independent of
    // tax mode. The line sum is pre-discount gross; `discount` absorbs every
    // reduction (per-line discounts + the order-level discount, and — for a
    // tax-INCLUSIVE outlet, where the sale total already contains the tax —
    // the tax too). For a tax-exclusive outlet the tax is added on top.
    //   invoice.total = linesSum − discount + tax  ==  txn.total
    const tax = txn.outlet.taxInclusive ? 0 : txn.taxTotal;
    const discount = linesSum + tax - txn.total;

    const invoice = await client.invoices.create({
      customerId,
      currency: INVOICE_CURRENCY,
      lines,
      ...(discount > 0 ? { discount } : {}),
      ...(tax > 0 ? { tax } : {}),
      memo: `Malapos sale ${txn.number} (${transactionId})`,
    });
    // Lifecycle: draft → finalize (assigns a number) → pay (issues a receipt).
    // finalize is tolerated-if-already-open so a created-as-open invoice still
    // proceeds to pay.
    try {
      await client.invoices.finalize(invoice.id);
    } catch {
      /* already finalized / open — proceed to pay */
    }
    await client.invoices.pay(invoice.id);

    // Stamp the guard. Conditional so a concurrent recorder can't double-set
    // (and so we never overwrite a different id that somehow won the race).
    await prisma.transaction.updateMany({
      where: { id: transactionId, plugipayInvoiceId: null },
      data: { plugipayInvoiceId: invoice.id },
    });
  } catch (err) {
    console.error('[sale-payment-record] failed to record sale to Payment module (non-fatal):', {
      transactionId,
      message: (err as Error).message,
    });
  }
}
