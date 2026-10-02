-- CreateEnum
CREATE TYPE "QuestionPaperStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT', 'LONG', 'TRANSLATION', 'WRITING', 'COMPREHENSION', 'MATCH', 'CUSTOM');

-- CreateTable
CREATE TABLE "QuestionPaper" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "gradeName" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "status" "QuestionPaperStatus" NOT NULL DEFAULT 'DRAFT',
    "totalMarks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionSection" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "passage" TEXT NOT NULL DEFAULT '',
    "rtl" BOOLEAN NOT NULL DEFAULT false,
    "attemptCount" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "options" JSONB NOT NULL DEFAULT '[]',
    "answer" TEXT NOT NULL DEFAULT '',
    "answerLines" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionPaperPrint" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "classId" TEXT,
    "classLabel" TEXT NOT NULL DEFAULT '',
    "copies" INTEGER NOT NULL,
    "answerKey" BOOLEAN NOT NULL DEFAULT false,
    "printedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionPaperPrint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionPaper_schoolId_status_idx" ON "QuestionPaper"("schoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionPaper_examId_gradeName_subjectId_key" ON "QuestionPaper"("examId", "gradeName", "subjectId");

-- CreateIndex
CREATE INDEX "QuestionSection_paperId_sortOrder_idx" ON "QuestionSection"("paperId", "sortOrder");

-- CreateIndex
CREATE INDEX "Question_sectionId_sortOrder_idx" ON "Question"("sectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "QuestionPaperPrint_paperId_idx" ON "QuestionPaperPrint"("paperId");

-- AddForeignKey
ALTER TABLE "QuestionPaper" ADD CONSTRAINT "QuestionPaper_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPaper" ADD CONSTRAINT "QuestionPaper_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPaper" ADD CONSTRAINT "QuestionPaper_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionSection" ADD CONSTRAINT "QuestionSection_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "QuestionPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "QuestionSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPaperPrint" ADD CONSTRAINT "QuestionPaperPrint_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "QuestionPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

