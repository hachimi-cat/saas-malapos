-- Per-item note. The cashier types a free-text instruction on an individual
-- cart line at ring-up (e.g. "no onions", "extra spicy"); it is surfaced on the
-- KDS (kitchen) + serve (expo) boards so the line cook and server see it.
-- Additive: one nullable column on transaction_items. Null = no note. Distinct
-- from the order-level transactions.note (whole-ticket instruction).

-- AlterTable
ALTER TABLE "transaction_items" ADD COLUMN     "note" TEXT;
