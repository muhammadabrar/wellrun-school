-- CreateEnum
CREATE TYPE "AcademicYearStatus" AS ENUM ('PLANNING', 'ACTIVE', 'CLOSED');

-- AlterTable
ALTER TABLE "AcademicYear" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "status" "AcademicYearStatus" NOT NULL DEFAULT 'PLANNING';

-- Keep only one current year per school (the latest-starting one wins if data drifted).
UPDATE "AcademicYear" y SET "current" = false
WHERE y."current" AND EXISTS (
  SELECT 1 FROM "AcademicYear" o
  WHERE o."schoolId" = y."schoolId" AND o."current" AND (o."startsOn" > y."startsOn" OR (o."startsOn" = y."startsOn" AND o."id" > y."id"))
);

-- Backfill: current -> ACTIVE, ended -> CLOSED, the rest stay PLANNING.
UPDATE "AcademicYear" SET "status" = 'ACTIVE' WHERE "current";
UPDATE "AcademicYear" SET "status" = 'CLOSED', "closedAt" = CURRENT_TIMESTAMP WHERE NOT "current" AND "endsOn" < CURRENT_TIMESTAMP;

-- One current year per school.
CREATE UNIQUE INDEX "AcademicYear_one_current_per_school" ON "AcademicYear"("schoolId") WHERE "current";
