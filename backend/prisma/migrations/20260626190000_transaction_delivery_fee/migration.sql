-- Delivery fee on a sale — the courier price the cashier picked at ring-up for
-- a DELIVERY (Fulfillment-module) quick sale. Additive only: a new column with
-- a 0 default, so every existing in-store sale reads back deliveryFee = 0 and
-- no existing column/value is rewritten.
--
--   transactions.deliveryFee — IDR courier fee, folded into `total` and shown
--   as a "Delivery" line on the receipt. Set from the chosen Fulkruma/Biteship
--   rate when orderType = DELIVERY; 0 otherwise.

ALTER TABLE "transactions" ADD COLUMN "deliveryFee" INTEGER NOT NULL DEFAULT 0;
