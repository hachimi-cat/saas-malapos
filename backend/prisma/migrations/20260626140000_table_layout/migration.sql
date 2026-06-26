-- Floor-map layout for F&B tables. All additive: a new TableShape enum and
-- five nullable/defaulted columns on `tables` (posX/posY position on the
-- editor canvas, plus shape/width/height for how the table is drawn). No
-- existing data is touched — unplaced tables keep posX/posY NULL and fall
-- back to the sell-view grid. See routes/tables.ts (PUT /tables/layout).

-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('SQUARE', 'ROUND', 'RECT');

-- AlterTable
ALTER TABLE "tables" ADD COLUMN "posX" INTEGER;
ALTER TABLE "tables" ADD COLUMN "posY" INTEGER;
ALTER TABLE "tables" ADD COLUMN "shape" "TableShape" NOT NULL DEFAULT 'SQUARE';
ALTER TABLE "tables" ADD COLUMN "width" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "tables" ADD COLUMN "height" INTEGER NOT NULL DEFAULT 1;
