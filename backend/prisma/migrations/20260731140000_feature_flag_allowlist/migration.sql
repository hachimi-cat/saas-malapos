-- The pilot allowlist: subjects who get a feature even while its flag is
-- off. Additive and defaulted, so every existing row keeps working and no
-- backfill is needed.
ALTER TABLE "feature_flags" ADD COLUMN "allowlist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
