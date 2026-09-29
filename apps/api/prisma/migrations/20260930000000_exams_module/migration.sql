-- CreateEnum
CREATE TYPE "ExamKind" AS ENUM ('EXAM', 'QUIZ', 'ASSIGNMENT', 'PRACTICAL', 'VIVA');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'MARKING', 'COMPLETED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "PaperStatus" AS ENUM ('NOT_STARTED', 'DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED');

-- CreateEnum
CREATE TYPE "MarkAttendance" AS ENUM ('PRESENT', 'ABSENT', 'MEDICAL', 'EXEMPT');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ResultScope" AS ENUM ('EXAM', 'TERM', 'ANNUAL');

-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingScale" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "bands" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradingScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSettings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "overallPassPct" DOUBLE PRECISION NOT NULL DEFAULT 33,
    "subjectPassRequired" BOOLEAN NOT NULL DEFAULT true,
    "maxFailSubjects" INTEGER NOT NULL DEFAULT 0,
    "graceMarks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "decimals" INTEGER NOT NULL DEFAULT 1,
    "absentCountsAsZero" BOOLEAN NOT NULL DEFAULT true,
    "assessmentWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rankMethod" TEXT NOT NULL DEFAULT 'DENSE',
    "rankScope" TEXT NOT NULL DEFAULT 'SECTION',
    "rankOnlyPassed" BOOLEAN NOT NULL DEFAULT false,
    "showRank" BOOLEAN NOT NULL DEFAULT true,
    "atRiskPct" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCardTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "layout" TEXT NOT NULL DEFAULT 'CLASSIC',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportCardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamPaper" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "date" DATE,
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "room" TEXT NOT NULL DEFAULT '',
    "invigilatorId" TEXT,
    "maxMarks" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "passMarks" DOUBLE PRECISION NOT NULL DEFAULT 33,
    "status" "PaperStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "enteredById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamMark" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "marks" DOUBLE PRECISION,
    "attendance" "MarkAttendance" NOT NULL DEFAULT 'PRESENT',
    "remark" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkCorrection" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "oldMarks" DOUBLE PRECISION,
    "newMarks" DOUBLE PRECISION,
    "oldAttendance" "MarkAttendance" NOT NULL DEFAULT 'PRESENT',
    "newAttendance" "MarkAttendance" NOT NULL DEFAULT 'PRESENT',
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarkCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentResult" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "scope" "ResultScope" NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "examId" TEXT,
    "termId" TEXT,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "totalObtained" DOUBLE PRECISION NOT NULL,
    "totalMax" DOUBLE PRECISION NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "grade" TEXT NOT NULL DEFAULT '',
    "gpa" DOUBLE PRECISION,
    "rank" INTEGER,
    "passed" BOOLEAN NOT NULL,
    "failedSubjects" INTEGER NOT NULL DEFAULT 0,
    "subjects" JSONB NOT NULL DEFAULT '[]',
    "attendancePct" DOUBLE PRECISION,
    "teacherRemark" TEXT NOT NULL DEFAULT '',
    "principalRemark" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentResult_pkey" PRIMARY KEY ("id")
);

-- Exam: new columns; legacy rows backfilled from heldOn and the school's matching academic year
DROP INDEX "Exam_schoolId_heldOn_idx";
ALTER TABLE "Exam" DROP CONSTRAINT "Exam_yearId_fkey";
ALTER TABLE "Exam"
ADD COLUMN     "code" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "startsOn" DATE,
ADD COLUMN     "endsOn" DATE,
ADD COLUMN     "gradingScaleId" TEXT,
ADD COLUMN     "includeInReportCard" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "instructions" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "kind" "ExamKind" NOT NULL DEFAULT 'EXAM',
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "termId" TEXT,
ADD COLUMN     "weight" DOUBLE PRECISION NOT NULL DEFAULT 100;

UPDATE "Exam" SET "startsOn" = "heldOn", "endsOn" = "heldOn", "status" = 'COMPLETED';

UPDATE "Exam" e SET "yearId" = (
  SELECT y."id" FROM "AcademicYear" y
  WHERE y."schoolId" = e."schoolId"
  ORDER BY (e."heldOn" BETWEEN y."startsOn" AND y."endsOn") DESC, y."current" DESC, y."startsOn" DESC
  LIMIT 1
) WHERE e."yearId" IS NULL;

DELETE FROM "Exam" WHERE "yearId" IS NULL;

ALTER TABLE "Exam" ALTER COLUMN "yearId" SET NOT NULL,
ALTER COLUMN "startsOn" SET NOT NULL,
ALTER COLUMN "endsOn" SET NOT NULL,
DROP COLUMN "heldOn";

-- Legacy ExamResult rows -> ExamPaper + ExamMark (already approved)
INSERT INTO "Subject" ("id", "schoolId", "name", "code", "enabled", "createdAt", "updatedAt")
SELECT DISTINCT ON (e."schoolId", lower(COALESCE(NULLIF(trim(r."subject"), ''), 'General')))
  'lgs' || substr(md5(e."schoolId" || lower(COALESCE(NULLIF(trim(r."subject"), ''), 'General'))), 1, 22),
  e."schoolId", COALESCE(NULLIF(trim(r."subject"), ''), 'General'), '', true, NOW(), NOW()
FROM "ExamResult" r JOIN "Exam" e ON e."id" = r."examId"
WHERE NOT EXISTS (
  SELECT 1 FROM "Subject" s WHERE s."schoolId" = e."schoolId"
  AND lower(s."name") = lower(COALESCE(NULLIF(trim(r."subject"), ''), 'General'))
);

CREATE TEMP TABLE legacy_marks AS
SELECT r."examId", r."studentId", e."schoolId", r."totalMarks", r."obtainedMarks",
  (SELECT s."id" FROM "Subject" s WHERE s."schoolId" = e."schoolId"
     AND lower(s."name") = lower(COALESCE(NULLIF(trim(r."subject"), ''), 'General')) LIMIT 1) AS "subjectId",
  (SELECT en."classId" FROM "Enrollment" en JOIN "Class" c ON c."id" = en."classId"
     WHERE en."studentId" = r."studentId" AND c."yearId" = e."yearId"
     ORDER BY en."active" DESC, en."createdAt" DESC LIMIT 1) AS "classId"
FROM "ExamResult" r JOIN "Exam" e ON e."id" = r."examId";

DELETE FROM legacy_marks WHERE "classId" IS NULL OR "subjectId" IS NULL;

INSERT INTO "ExamPaper" ("id", "schoolId", "examId", "classId", "subjectId", "date", "maxMarks", "passMarks", "status", "reviewedAt", "createdAt", "updatedAt")
SELECT 'lgp' || substr(md5(m."examId" || m."classId" || m."subjectId"), 1, 22), m."schoolId", m."examId", m."classId", m."subjectId",
  (SELECT e."startsOn" FROM "Exam" e WHERE e."id" = m."examId"),
  MAX(m."totalMarks"), ROUND(MAX(m."totalMarks") * 0.33), 'APPROVED', NOW(), NOW(), NOW()
FROM legacy_marks m
GROUP BY m."schoolId", m."examId", m."classId", m."subjectId";

INSERT INTO "ExamMark" ("id", "schoolId", "paperId", "studentId", "marks", "attendance", "createdAt", "updatedAt")
SELECT DISTINCT ON (m."examId", m."classId", m."subjectId", m."studentId")
  'lgm' || substr(md5(m."examId" || m."classId" || m."subjectId" || m."studentId"), 1, 22), m."schoolId",
  'lgp' || substr(md5(m."examId" || m."classId" || m."subjectId"), 1, 22), m."studentId", m."obtainedMarks", 'PRESENT', NOW(), NOW()
FROM legacy_marks m;

DROP TABLE legacy_marks;

ALTER TABLE "ExamResult" DROP CONSTRAINT "ExamResult_examId_fkey";
ALTER TABLE "ExamResult" DROP CONSTRAINT "ExamResult_studentId_fkey";
DROP TABLE "ExamResult";

ALTER TABLE "Exam" ADD CONSTRAINT "Exam_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Term_schoolId_yearId_idx" ON "Term"("schoolId", "yearId");

-- CreateIndex
CREATE INDEX "GradingScale_schoolId_idx" ON "GradingScale"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSettings_schoolId_key" ON "ExamSettings"("schoolId");

-- CreateIndex
CREATE INDEX "ReportCardTemplate_schoolId_idx" ON "ReportCardTemplate"("schoolId");

-- CreateIndex
CREATE INDEX "ExamPaper_schoolId_status_idx" ON "ExamPaper"("schoolId", "status");

-- CreateIndex
CREATE INDEX "ExamPaper_classId_idx" ON "ExamPaper"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaper_examId_classId_subjectId_key" ON "ExamPaper"("examId", "classId", "subjectId");

-- CreateIndex
CREATE INDEX "ExamMark_studentId_idx" ON "ExamMark"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamMark_paperId_studentId_key" ON "ExamMark"("paperId", "studentId");

-- CreateIndex
CREATE INDEX "MarkCorrection_schoolId_status_idx" ON "MarkCorrection"("schoolId", "status");

-- CreateIndex
CREATE INDEX "StudentResult_schoolId_yearId_scope_idx" ON "StudentResult"("schoolId", "yearId", "scope");

-- CreateIndex
CREATE INDEX "StudentResult_studentId_idx" ON "StudentResult"("studentId");

-- CreateIndex
CREATE INDEX "StudentResult_classId_idx" ON "StudentResult"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentResult_scope_scopeKey_studentId_key" ON "StudentResult"("scope", "scopeKey", "studentId");

-- CreateIndex
CREATE INDEX "Exam_schoolId_yearId_kind_idx" ON "Exam"("schoolId", "yearId", "kind");

-- CreateIndex
CREATE INDEX "Exam_schoolId_startsOn_idx" ON "Exam"("schoolId", "startsOn");

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingScale" ADD CONSTRAINT "GradingScale_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSettings" ADD CONSTRAINT "ExamSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCardTemplate" ADD CONSTRAINT "ReportCardTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_gradingScaleId_fkey" FOREIGN KEY ("gradingScaleId") REFERENCES "GradingScale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_invigilatorId_fkey" FOREIGN KEY ("invigilatorId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamMark" ADD CONSTRAINT "ExamMark_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "ExamPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamMark" ADD CONSTRAINT "ExamMark_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkCorrection" ADD CONSTRAINT "MarkCorrection_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "ExamPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkCorrection" ADD CONSTRAINT "MarkCorrection_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentResult" ADD CONSTRAINT "StudentResult_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentResult" ADD CONSTRAINT "StudentResult_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentResult" ADD CONSTRAINT "StudentResult_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentResult" ADD CONSTRAINT "StudentResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
