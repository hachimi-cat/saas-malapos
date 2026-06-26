-- Per-item Kitchen Display state. The KDS now tracks + advances INDIVIDUAL
-- items of a ticket (and supports UNDO), not just the whole order. Additive:
-- one nullable column on transaction_items, reusing the existing KdsState enum.
--
-- A null kdsState = not a kitchen item (retail/pharmacy line). For F&B sales
-- each item is set to NEW at sale/park time (see lib/sell.ts); the ticket's
-- effective state is derived as the least-advanced active item, and
-- Transaction.kdsState is kept in sync to that value.

-- AlterTable
ALTER TABLE "transaction_items" ADD COLUMN "kdsState" "KdsState";

-- Backfill: existing active tickets (transactions with a non-null kdsState)
-- seed every one of their items to the ticket's current state, so the board
-- isn't full of nulls right after deploy. SERVED/null tickets stay null.
UPDATE "transaction_items" ti
SET "kdsState" = t."kdsState"
FROM "transactions" t
WHERE ti."transactionId" = t."id"
  AND t."kdsState" IS NOT NULL;
