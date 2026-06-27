-- Deferred-dispatch draft on a sale. Additive only: a new NULLable JSONB
-- column, so every existing sale reads back deliveryDraft = NULL and no
-- existing column/value is rewritten.
--
--   transactions.deliveryDraft — the delivery destination + chosen courier +
--   parcel captured at ring-up for a DELIVERY order. Persisted so the Fulkruma
--   shipment can be created later (deferred dispatch) from the sale-detail or
--   serve board, instead of auto-dispatching the instant the sale completes.
--   NULL for in-store (non-delivery) sales.

ALTER TABLE "transactions" ADD COLUMN "deliveryDraft" JSONB;
