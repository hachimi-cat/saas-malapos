-- Partial refunds + gift cards / store credit + Kitchen Display (KDS).
-- All additive: two new enum TYPES, two new columns on transactions, three
-- new tables. (The two new enum VALUES — PARTIALLY_REFUNDED, GIFT_CARD — were
-- added in the preceding 20260618085000 migration so they are usable here.)

-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'VOID');

-- CreateEnum
CREATE TYPE "KdsState" AS ENUM ('NEW', 'PREPARING', 'READY', 'SERVED');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "refundedTotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "transactions" ADD COLUMN "kdsState" "KdsState";

-- CreateIndex
CREATE INDEX "transactions_accountId_kdsState_createdAt_idx" ON "transactions"("accountId", "kdsState", "createdAt");

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "restocked" BOOLEAN NOT NULL DEFAULT false,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "bySub" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refunds_accountId_transactionId_idx" ON "refunds"("accountId", "transactionId");

-- CreateTable
CREATE TABLE "gift_cards" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initialBalance" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "customerId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gift_cards_accountId_code_key" ON "gift_cards"("accountId", "code");

-- CreateIndex
CREATE INDEX "gift_cards_accountId_customerId_idx" ON "gift_cards"("accountId", "customerId");

-- CreateTable
CREATE TABLE "gift_card_entries" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "transactionId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_card_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gift_card_entries_accountId_giftCardId_idx" ON "gift_card_entries"("accountId", "giftCardId");

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_card_entries" ADD CONSTRAINT "gift_card_entries_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "gift_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
