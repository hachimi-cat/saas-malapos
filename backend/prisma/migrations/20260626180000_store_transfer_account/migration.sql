-- Store bank-TRANSFER tender — a manual, immediately-completing payment method
-- (like CASH) where the customer transfers to the merchant's store bank
-- account and the cashier taps "Confirm received". DISTINCT from the Plugipay
-- PAYOUT account (routes/payment/payouts.ts). All additive — no existing
-- column/value is dropped or rewritten.
--
--   PaymentMethod += 'TRANSFER' — the manual bank-transfer tender. It does NOT
--   ride the Plugipay parked-then-settle checkout (unlike QRIS/VA); it
--   completes at the counter through the same createSale /
--   settleParkedSaleManual / addParkedSalePayment paths as CASH/CARD, and so
--   inherits the per-sale Plugipay invoice recording when the Payment module
--   is ON (lib/sale-payment-record.ts). NOTE for the deployer:
--   `ALTER TYPE ... ADD VALUE` is safe inside a migration on PostgreSQL 12+ as
--   long as the new value is not USED in the same migration (it isn't here) —
--   first USE is at runtime.
--
--   pos_settings.transferBankName / transferBankAccountNumber /
--   transferBankAccountHolder — the store bank account the cashier shows the
--   customer for a TRANSFER payment. Informational; null until configured in
--   Settings → Business profile.
--
-- See lib/sell.ts, routes/sales.ts, routes/settings.ts.

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'TRANSFER';

-- AlterTable
ALTER TABLE "pos_settings" ADD COLUMN "transferBankName" TEXT;
ALTER TABLE "pos_settings" ADD COLUMN "transferBankAccountNumber" TEXT;
ALTER TABLE "pos_settings" ADD COLUMN "transferBankAccountHolder" TEXT;
