-- Payment-module ↔ POS sale connection (Plugipay invoice + receipt per sale)
-- plus VA (virtual-account) as a Plugipay-processed payment method.
--
-- All additive — no existing column/value is dropped or rewritten.
--
--   PaymentMethod += 'VA' — a virtual-account tender. Rides the exact same
--   parked-then-settle Plugipay checkout flow as dynamic QRIS (the inbound
--   webhook settles a PARKED sale whose PENDING checkout payment is QRIS or
--   VA). NOTE for the deployer: `ALTER TYPE ... ADD VALUE` is safe inside a
--   migration on PostgreSQL 12+ as long as the new value is not USED in the
--   same migration (it isn't here) — first USE is at runtime.
--
--   transactions.plugipayInvoiceId — the Plugipay invoice recorded for a
--   completed non-checkout sale (cash/card/transfer/gift-card) when the
--   Payment module is ON, so the sale shows up in the payment module's
--   invoices + receipts views. Doubles as the per-sale idempotency guard:
--   a sale that already carries an invoice id is never re-recorded.
--
--   pos_settings.plugipayPosCustomerId — the generic "POS Walk-in" customer
--   minted once in the merchant's Plugipay workspace, used as the customerId
--   on those per-sale invoices (Plugipay invoices require a customerId;
--   counter sales are usually anonymous).
--
-- See lib/sale-payment-record.ts, lib/sell.ts, lib/order-payment.ts,
-- routes/payments.ts.

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'VA';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "plugipayInvoiceId" TEXT;

-- AlterTable
ALTER TABLE "pos_settings" ADD COLUMN "plugipayPosCustomerId" TEXT;
