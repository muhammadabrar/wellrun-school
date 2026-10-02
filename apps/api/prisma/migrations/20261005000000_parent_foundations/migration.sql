-- Parent portal foundations.
--  * Guardian: one row per phone and per CNIC within a school (parents sign in with their phone).
--    Existing duplicates are merged by phone (children are re-pointed to the oldest guardian).
--    A CNIC shared by two guardians with different phones is kept on the oldest row only; the
--    other guardian keeps their phone and their children, and simply has no CNIC on file.
--  * Payment.reversedAt: when a completed payment was voided or refunded.

-- DropIndex
DROP INDEX "Guardian_schoolId_phone_idx";

-- DropIndex
DROP INDEX "Guardian_schoolId_cnic_idx";

-- AlterTable
ALTER TABLE "Guardian" ADD COLUMN "phoneNorm" TEXT,
ALTER COLUMN "cnic" DROP NOT NULL,
ALTER COLUMN "cnic" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "reversedAt" TIMESTAMP(3);

-- Backfill phoneNorm the same way the app does (digits only, 92-prefixed).
-- A guardian with no usable digits gets a placeholder so the unique key still holds; they just can't sign in.
UPDATE "Guardian" g
SET "phoneNorm" = CASE
  WHEN s.d = '' THEN 'unknown-' || g."id"
  WHEN s.d LIKE '92%' THEN s.d
  WHEN s.d LIKE '0%' THEN '92' || substr(s.d, 2)
  WHEN length(s.d) = 10 THEN '92' || s.d
  ELSE s.d
END
FROM (SELECT "id", regexp_replace("phone", '\D', '', 'g') AS d FROM "Guardian") s
WHERE s."id" = g."id";

-- Merge guardians that share a phone inside one school.
CREATE TEMP TABLE "_guardian_merge" AS
SELECT "id" AS dup_id, keep_id
FROM (
  SELECT "id", FIRST_VALUE("id") OVER (PARTITION BY "schoolId", "phoneNorm" ORDER BY "createdAt", "id") AS keep_id
  FROM "Guardian"
) ranked
WHERE "id" <> keep_id;

INSERT INTO "StudentGuardian" ("studentId", "guardianId")
SELECT sg."studentId", m.keep_id
FROM "StudentGuardian" sg
JOIN "_guardian_merge" m ON m.dup_id = sg."guardianId"
ON CONFLICT DO NOTHING;

UPDATE "AdmissionApplication" a
SET "guardianId" = m.keep_id
FROM "_guardian_merge" m
WHERE a."guardianId" = m.dup_id;

-- The surviving row inherits a CNIC / email it was missing.
UPDATE "Guardian" k
SET "cnic" = x."cnic"
FROM (
  SELECT DISTINCT ON (m.keep_id) m.keep_id, g."cnic"
  FROM "_guardian_merge" m
  JOIN "Guardian" g ON g."id" = m.dup_id
  WHERE g."cnic" IS NOT NULL AND btrim(g."cnic") <> ''
  ORDER BY m.keep_id, g."createdAt"
) x
WHERE k."id" = x.keep_id AND (k."cnic" IS NULL OR btrim(k."cnic") = '');

UPDATE "Guardian" k
SET "email" = x."email"
FROM (
  SELECT DISTINCT ON (m.keep_id) m.keep_id, g."email"
  FROM "_guardian_merge" m
  JOIN "Guardian" g ON g."id" = m.dup_id
  WHERE g."email" IS NOT NULL AND btrim(g."email") <> ''
  ORDER BY m.keep_id, g."createdAt"
) x
WHERE k."id" = x.keep_id AND (k."email" IS NULL OR btrim(k."email") = '');

DELETE FROM "Guardian" WHERE "id" IN (SELECT dup_id FROM "_guardian_merge");
DROP TABLE "_guardian_merge";

-- CNIC: blank means unknown; 13 digits are stored as 00000-0000000-0.
UPDATE "Guardian" SET "cnic" = NULL WHERE "cnic" IS NOT NULL AND btrim("cnic") = '';

UPDATE "Guardian" g
SET "cnic" = substr(s.d, 1, 5) || '-' || substr(s.d, 6, 7) || '-' || substr(s.d, 13, 1)
FROM (SELECT "id", regexp_replace("cnic", '\D', '', 'g') AS d FROM "Guardian" WHERE "cnic" IS NOT NULL) s
WHERE s."id" = g."id" AND length(s.d) = 13;

UPDATE "Guardian" SET "cnic" = btrim("cnic")
WHERE "cnic" IS NOT NULL AND length(regexp_replace("cnic", '\D', '', 'g')) <> 13;

-- A CNIC can belong to one guardian per school: keep it on the oldest row.
UPDATE "Guardian" g
SET "cnic" = NULL
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "schoolId", "cnic" ORDER BY "createdAt", "id") AS rn
  FROM "Guardian" WHERE "cnic" IS NOT NULL
) r
WHERE g."id" = r."id" AND r.rn > 1;

ALTER TABLE "Guardian" ALTER COLUMN "phoneNorm" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Guardian_phoneNorm_idx" ON "Guardian"("phoneNorm");

-- CreateIndex
CREATE UNIQUE INDEX "Guardian_schoolId_phoneNorm_key" ON "Guardian"("schoolId", "phoneNorm");

-- CreateIndex
CREATE UNIQUE INDEX "Guardian_schoolId_cnic_key" ON "Guardian"("schoolId", "cnic");

-- Payments voided or refunded before this column existed: best available date is the last update.
UPDATE "Payment" SET "reversedAt" = "updatedAt" WHERE "status" IN ('VOIDED', 'REFUNDED') AND "reversedAt" IS NULL;
