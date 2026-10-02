-- CreateEnum
CREATE TYPE "DiaryKind" AS ENUM ('HOMEWORK', 'CLASSWORK', 'NOTE');

-- CreateEnum
CREATE TYPE "NoticeAudience" AS ENUM ('ALL', 'CLASSES');

-- CreateTable
CREATE TABLE "DiaryEntry" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "campusId" TEXT,
    "yearId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT,
    "date" DATE NOT NULL,
    "kind" "DiaryKind" NOT NULL DEFAULT 'HOMEWORK',
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "dueOn" DATE,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "authorStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "campusId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "NoticeAudience" NOT NULL DEFAULT 'ALL',
    "classIds" JSONB NOT NULL DEFAULT '[]',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiaryEntry_schoolId_classId_date_idx" ON "DiaryEntry"("schoolId", "classId", "date");

-- CreateIndex
CREATE INDEX "DiaryEntry_schoolId_date_idx" ON "DiaryEntry"("schoolId", "date");

-- CreateIndex
CREATE INDEX "DiaryEntry_authorStaffId_date_idx" ON "DiaryEntry"("authorStaffId", "date");

-- CreateIndex
CREATE INDEX "Notice_schoolId_publishedAt_idx" ON "Notice"("schoolId", "publishedAt");

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_authorStaffId_fkey" FOREIGN KEY ("authorStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
