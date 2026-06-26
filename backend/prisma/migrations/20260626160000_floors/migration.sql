-- Multiple floors per outlet (F&B). A `floors` row is a level inside an outlet
-- (e.g. "Ground Floor", "Rooftop"); each floor owns its own table layout. We
-- add a nullable `floorId` to `tables`, then BACKFILL: every outlet that
-- currently has tables gets a default "Main floor", and all of that outlet's
-- existing tables are reassigned to it — so seeded/positioned tables keep their
-- posX/posY on a real floor and nothing disappears. All additive; no existing
-- column is dropped or rewritten. See routes/floors.ts + routes/tables.ts.

-- CreateTable
CREATE TABLE "floors" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "floors_accountId_outletId_idx" ON "floors"("accountId", "outletId");

-- CreateIndex
CREATE UNIQUE INDEX "floors_outletId_name_key" ON "floors"("outletId", "name");

-- AlterTable
ALTER TABLE "tables" ADD COLUMN "floorId" TEXT;

-- CreateIndex
CREATE INDEX "tables_accountId_floorId_idx" ON "tables"("accountId", "floorId");

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Backfill ──────────────────────────────────────────────────────────────
-- 1) One "Main floor" per distinct outlet that currently has tables. The
--    (outletId, name) unique index guarantees at most one per outlet, so the
--    UPDATE join below is unambiguous. gen_random_uuid() is core in PG13+
--    (no extension needed); the id only has to be unique, the `flr_` prefix
--    keeps it consistent with the app's id scheme.
INSERT INTO "floors" ("id", "accountId", "outletId", "name", "sortOrder", "createdAt", "updatedAt")
SELECT
    'flr_' || replace(gen_random_uuid()::text, '-', ''),
    d."accountId",
    d."outletId",
    'Main floor',
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "accountId", "outletId" FROM "tables") AS d;

-- 2) Point every existing table at its outlet's "Main floor".
UPDATE "tables" AS t
SET "floorId" = f."id"
FROM "floors" AS f
WHERE f."outletId" = t."outletId"
  AND f."name" = 'Main floor'
  AND t."floorId" IS NULL;
