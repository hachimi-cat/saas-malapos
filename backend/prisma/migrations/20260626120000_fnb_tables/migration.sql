-- F&B table management. A dine-in table at an outlet holds an "open bill" —
-- a PARKED transaction with that tableId. All additive/nullable: a new
-- `tables` table, two new columns on `transactions` (tableId + orderType),
-- and a new OrderType enum. No existing data is touched (orderType
-- back-fills to the TAKEAWAY default). See routes/tables.ts + lib/sell.ts.

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'TAKEAWAY', 'DELIVERY');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "tableId" TEXT;
ALTER TABLE "transactions" ADD COLUMN "orderType" "OrderType" NOT NULL DEFAULT 'TAKEAWAY';

-- CreateTable
CREATE TABLE "tables" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "zone" TEXT,
    "seats" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tables_accountId_outletId_idx" ON "tables"("accountId", "outletId");

-- CreateIndex
CREATE UNIQUE INDEX "tables_outletId_label_key" ON "tables"("outletId", "label");

-- CreateIndex
CREATE INDEX "transactions_accountId_tableId_idx" ON "transactions"("accountId", "tableId");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
