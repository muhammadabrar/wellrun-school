-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "markedById" TEXT;

-- CreateTable
CREATE TABLE "AttendanceSettings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "workingWeekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "lowThresholdPct" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "teacherEditDays" INTEGER NOT NULL DEFAULT 0,
    "lateCountsPresent" BOOLEAN NOT NULL DEFAULT true,
    "leaveCountsPresent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "campusId" TEXT,
    "name" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSettings_schoolId_key" ON "AttendanceSettings"("schoolId");

-- CreateIndex
CREATE INDEX "Holiday_schoolId_startsOn_idx" ON "Holiday"("schoolId", "startsOn");

-- AddForeignKey
ALTER TABLE "AttendanceSettings" ADD CONSTRAINT "AttendanceSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

