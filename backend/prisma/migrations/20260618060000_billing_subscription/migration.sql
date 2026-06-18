-- Billing: Plugipay-backed plan subscriptions (one per workspace).
-- Tier ids + outlet/product/member limits live in src/lib/billing.ts.
-- Additive only — no existing tables touched.

-- CreateTable
CREATE TABLE "billing_subscriptions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "plugipayCheckoutSessionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_subscriptions_accountId_key" ON "billing_subscriptions"("accountId");

-- CreateIndex
CREATE INDEX "billing_subscriptions_plugipayCheckoutSessionId_idx" ON "billing_subscriptions"("plugipayCheckoutSessionId");
