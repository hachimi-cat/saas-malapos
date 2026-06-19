-- A POS sale can optionally become a delivery order, dispatched via the
-- Fulfillment module (Fulkruma → Biteship). Two additive columns on the
-- existing transactions table — no data touched. See routes/delivery.ts
-- + routes/webhooks-fulkruma.ts.

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "fulkrumaShipmentId" TEXT;
ALTER TABLE "transactions" ADD COLUMN "deliveryStatus" TEXT;

-- CreateIndex
CREATE INDEX "transactions_fulkrumaShipmentId_idx" ON "transactions"("fulkrumaShipmentId");
