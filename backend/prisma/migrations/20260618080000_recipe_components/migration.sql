-- Composite items / bill-of-materials (recipes, bundles, compounding, break-bulk).
-- Additive: a new component table + an isComposite flag on ProductVariant.

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN "isComposite" BOOLEAN NOT NULL DEFAULT false;

-- Stock quantities become fractional so break-bulk / compounding components
-- can be consumed in decimal amounts (e.g. 0.01 of a "box of 100"). Widening
-- INTEGER → DOUBLE PRECISION is a lossless cast for existing rows.
ALTER TABLE "stock_levels" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "stock_levels" ALTER COLUMN "reorderPoint" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "stock_movements" ALTER COLUMN "qtyDelta" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "stock_movements" ALTER COLUMN "balanceAfter" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "stock_batches" ALTER COLUMN "qtyRemaining" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "recipe_components" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "parentVariantId" TEXT NOT NULL,
    "componentVariantId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipe_components_accountId_parentVariantId_idx" ON "recipe_components"("accountId", "parentVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_components_parentVariantId_componentVariantId_key" ON "recipe_components"("parentVariantId", "componentVariantId");

-- AddForeignKey
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_parentVariantId_fkey" FOREIGN KEY ("parentVariantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_componentVariantId_fkey" FOREIGN KEY ("componentVariantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
