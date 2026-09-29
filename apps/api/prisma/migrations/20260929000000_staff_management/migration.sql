-- Staff management: profile + employment fields, contracts, status history and payroll.
-- Name and CNIC are locked in the API once set; staff are never deleted, only moved to RESIGNED/TERMINATED.

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('PERMANENT', 'CONTRACT', 'PROBATION', 'PART_TIME', 'VISITING');

-- CreateEnum
CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'FINALIZED', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "address" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bankAccountNo" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bankAccountTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bankName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "campusId" TEXT,
ADD COLUMN     "cnic" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "department" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "employeeNo" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "gender" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "joinDate" TIMESTAMP(3),
ADD COLUMN     "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "StaffContract" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "type" "ContractType" NOT NULL DEFAULT 'PERMANENT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "basicSalaryPkr" INTEGER NOT NULL DEFAULT 0,
    "allowances" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffStatusChange" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "fromStatus" "StaffStatus" NOT NULL,
    "toStatus" "StaffStatus" NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "effectiveOn" TIMESTAMP(3) NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "payslipNo" TEXT NOT NULL DEFAULT '',
    "basicPkr" INTEGER NOT NULL DEFAULT 0,
    "allowances" JSONB NOT NULL DEFAULT '[]',
    "deductions" JSONB NOT NULL DEFAULT '[]',
    "grossPkr" INTEGER NOT NULL DEFAULT 0,
    "deductionPkr" INTEGER NOT NULL DEFAULT 0,
    "netPkr" INTEGER NOT NULL DEFAULT 0,
    "status" "PayslipStatus" NOT NULL DEFAULT 'DRAFT',
    "paidOn" TIMESTAMP(3),
    "method" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffContract_schoolId_idx" ON "StaffContract"("schoolId");

-- CreateIndex
CREATE INDEX "StaffContract_staffId_idx" ON "StaffContract"("staffId");

-- CreateIndex
CREATE INDEX "StaffStatusChange_staffId_idx" ON "StaffStatusChange"("staffId");

-- CreateIndex
CREATE INDEX "Payslip_schoolId_period_idx" ON "Payslip"("schoolId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_staffId_period_key" ON "Payslip"("staffId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_userId_key" ON "Staff"("userId");

-- CreateIndex
CREATE INDEX "Staff_schoolId_cnic_idx" ON "Staff"("schoolId", "cnic");

-- CreateIndex
CREATE INDEX "Staff_schoolId_status_idx" ON "Staff"("schoolId", "status");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffContract" ADD CONSTRAINT "StaffContract_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffContract" ADD CONSTRAINT "StaffContract_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffStatusChange" ADD CONSTRAINT "StaffStatusChange_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffStatusChange" ADD CONSTRAINT "StaffStatusChange_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: link existing staff to the login that shares their email (teachers were matched by email before).
UPDATE "Staff" s
SET "userId" = u."id"
FROM "User" u
WHERE s."userId" IS NULL
  AND s."email" IS NOT NULL
  AND lower(s."email") = lower(u."email")
  AND u."schoolId" = s."schoolId"
  AND NOT EXISTS (SELECT 1 FROM "Staff" other WHERE other."userId" = u."id");

-- Backfill: employee numbers in join order, per school.
UPDATE "Staff" s
SET "employeeNo" = 'EMP-' || lpad(numbered.n::text, 4, '0')
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "schoolId" ORDER BY "createdAt", "id") AS n
  FROM "Staff"
) numbered
WHERE numbered."id" = s."id" AND s."employeeNo" = '';
