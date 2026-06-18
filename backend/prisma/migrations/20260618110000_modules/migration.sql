-- Partner-modules framework: per-merchant integration toggles + the
-- per-merchant partner workspace ids minted at first enable. All
-- columns added to the existing pos_settings table — additive only,
-- no data touched. See src/services/modules-service.ts.

-- AlterTable
ALTER TABLE "pos_settings" ADD COLUMN "modulesEnabled" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "pos_settings" ADD COLUMN "plugipayMerchantAccountId" TEXT;
ALTER TABLE "pos_settings" ADD COLUMN "fulkrumaAccountId" TEXT;
ALTER TABLE "pos_settings" ADD COLUMN "ripploAccountId" TEXT;
