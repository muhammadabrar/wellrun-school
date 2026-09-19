-- AlterTable
ALTER TABLE "AdmissionApplication" ADD COLUMN "feeQuotes" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "AdmissionApplication" ADD COLUMN "wizardStep" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AdmissionApplication" ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "AdmissionApplication_createdById_idx" ON "AdmissionApplication"("createdById");

-- AddForeignKey
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Documents in the admission wizard are optional.
UPDATE "SchoolDocument" SET "required" = false WHERE "ownerType" = 'application';
