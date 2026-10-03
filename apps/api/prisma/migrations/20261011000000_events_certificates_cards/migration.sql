-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('EVENT', 'MEETING', 'TRIP', 'SPORTS', 'CULTURAL', 'OTHER');

-- CreateEnum
CREATE TYPE "EventAudience" AS ENUM ('ALL', 'CLASSES', 'STAFF');

-- CreateEnum
CREATE TYPE "CertificateType" AS ENUM ('BONAFIDE', 'CHARACTER', 'LEAVING', 'MERIT');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('ISSUED', 'REVOKED');

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "photoUrl" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "SchoolEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "campusId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" "EventKind" NOT NULL DEFAULT 'EVENT',
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "audience" "EventAudience" NOT NULL DEFAULT 'ALL',
    "classIds" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" "CertificateType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuedCertificate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "CertificateType" NOT NULL,
    "serial" TEXT NOT NULL,
    "issuedOn" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "status" "CertificateStatus" NOT NULL DEFAULT 'ISSUED',
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokeReason" TEXT NOT NULL DEFAULT '',
    "issuedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssuedCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolEvent_schoolId_startsOn_idx" ON "SchoolEvent"("schoolId", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateTemplate_schoolId_type_key" ON "CertificateTemplate"("schoolId", "type");

-- CreateIndex
CREATE INDEX "IssuedCertificate_schoolId_issuedOn_idx" ON "IssuedCertificate"("schoolId", "issuedOn");

-- CreateIndex
CREATE INDEX "IssuedCertificate_studentId_idx" ON "IssuedCertificate"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "IssuedCertificate_schoolId_serial_key" ON "IssuedCertificate"("schoolId", "serial");

-- AddForeignKey
ALTER TABLE "SchoolEvent" ADD CONSTRAINT "SchoolEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEvent" ADD CONSTRAINT "SchoolEvent_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateTemplate" ADD CONSTRAINT "CertificateTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedCertificate" ADD CONSTRAINT "IssuedCertificate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedCertificate" ADD CONSTRAINT "IssuedCertificate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

