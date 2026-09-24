-- Fee management ledger: heads, structures, invoices snapshots, allocations, credits, receipts, FBR stub.

-- Recreate InvoiceStatus with ledger values.
CREATE TYPE "InvoiceStatus_new" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');
ALTER TABLE "Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE "InvoiceStatus_new" USING (
  CASE "status"::text
    WHEN 'PARTIAL' THEN 'PARTIALLY_PAID'
    WHEN 'VOID' THEN 'CANCELLED'
    ELSE "status"::text
  END::"InvoiceStatus_new"
);
DROP TYPE "InvoiceStatus";
ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'ISSUED'::"InvoiceStatus";

CREATE TYPE "FeeFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONE_TIME');
CREATE TYPE "FeeStructureStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'PERCENT');
CREATE TYPE "LateFeeMode" AS ENUM ('NONE', 'FIXED', 'DAILY', 'PERCENT');
CREATE TYPE "PaymentStatus" AS ENUM ('COMPLETED', 'VOIDED', 'REFUNDED');
CREATE TYPE "CreditStatus" AS ENUM ('AVAILABLE', 'PARTIALLY_USED', 'USED', 'REFUNDED');
CREATE TYPE "FbrStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'CANCELLED');
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'ENDED');

ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "taxNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "ntn" TEXT NOT NULL DEFAULT '';
ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "strn" TEXT NOT NULL DEFAULT '';
ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "primaryColor" TEXT NOT NULL DEFAULT '#4642ff';

CREATE TABLE "FeeHead" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "campusId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'tuition',
    "frequency" "FeeFrequency" NOT NULL DEFAULT 'MONTHLY',
    "recurring" BOOLEAN NOT NULL DEFAULT true,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "amountPkr" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeeHead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeeStructure" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "campusId" TEXT,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "className" TEXT NOT NULL DEFAULT '',
    "section" TEXT NOT NULL DEFAULT '',
    "frequency" "FeeFrequency" NOT NULL DEFAULT 'MONTHLY',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveUntil" TIMESTAMP(3),
    "status" "FeeStructureStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeeStructureItem" (
    "id" TEXT NOT NULL,
    "feeStructureId" TEXT NOT NULL,
    "feeHeadId" TEXT NOT NULL,
    "amountPkr" INTEGER NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeeStructureItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentFeeAssignment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "feeStructureId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveUntil" TIMESTAMP(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentFeeAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentFeeOverride" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "feeHeadId" TEXT NOT NULL,
    "amountPkr" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentFeeOverride_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Discount" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value" INTEGER NOT NULL,
    "feeHeadIds" JSONB NOT NULL DEFAULT '[]',
    "classNames" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentDiscount" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "discountId" TEXT,
    "name" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value" INTEGER NOT NULL,
    "feeHeadIds" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentDiscount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchoolFeeSettings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "defaultDueDay" INTEGER NOT NULL DEFAULT 10,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "lateFeeMode" "LateFeeMode" NOT NULL DEFAULT 'NONE',
    "lateFeeAmountPkr" INTEGER NOT NULL DEFAULT 0,
    "lateFeePercent" INTEGER NOT NULL DEFAULT 0,
    "lateFeeCapPkr" INTEGER NOT NULL DEFAULT 0,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "paymentPrefix" TEXT NOT NULL DEFAULT 'PAY',
    "receiptPrefix" TEXT NOT NULL DEFAULT 'REC',
    "receiptHeader" TEXT NOT NULL DEFAULT '',
    "receiptFooter" TEXT NOT NULL DEFAULT 'Thank you for your payment.',
    "showTaxOnReceipt" BOOLEAN NOT NULL DEFAULT false,
    "fbrEnabled" BOOLEAN NOT NULL DEFAULT false,
    "fbrEnvironment" TEXT NOT NULL DEFAULT 'sandbox',
    "fbrCredentialsEnc" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolFeeSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "feeHeadId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmountPkr" INTEGER NOT NULL,
    "grossAmountPkr" INTEGER NOT NULL,
    "discountAmountPkr" INTEGER NOT NULL DEFAULT 0,
    "taxAmountPkr" INTEGER NOT NULL DEFAULT 0,
    "netAmountPkr" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountPkr" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentCredit" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sourcePaymentId" TEXT,
    "amountPkr" INTEGER NOT NULL,
    "remainingAmountPkr" INTEGER NOT NULL,
    "status" "CreditStatus" NOT NULL DEFAULT 'AVAILABLE',
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentCredit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "campusId" TEXT,
    "studentId" TEXT,
    "paymentId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountPkr" INTEGER NOT NULL,
    "generatedById" TEXT,
    "pdfPath" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FbrInvoice" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "fbrInvoiceNumber" TEXT,
    "fbrStatus" "FbrStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "qrCodeData" TEXT,
    "submissionDate" TIMESTAMP(3),
    "responseData" JSONB,
    "errorMessage" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FbrInvoice_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "campusId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "academicYearId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "feeStructureId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "billingPeriod" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "subtotalPkr" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "discountAmountPkr" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "lateFeeAmountPkr" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "taxAmountPkr" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "totalAmountPkr" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paidAmountPkr" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "balanceAmountPkr" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invoice" ALTER COLUMN "feePlanId" DROP NOT NULL;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "campusId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "studentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "paymentNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "collectedById" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED';
ALTER TABLE "Payment" ALTER COLUMN "invoiceId" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "SchoolFeeSettings_schoolId_key" ON "SchoolFeeSettings"("schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "Receipt_paymentId_key" ON "Receipt"("paymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "Receipt_schoolId_receiptNumber_key" ON "Receipt"("schoolId", "receiptNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentAllocation_paymentId_invoiceId_key" ON "PaymentAllocation"("paymentId", "invoiceId");

INSERT INTO "FeeHead" ("id", "schoolId", "name", "code", "category", "frequency", "recurring", "taxable", "description", "active", "amountPkr", "sortOrder", "createdAt", "updatedAt")
SELECT "id", "schoolId", "name",
  upper(regexp_replace("name", '[^A-Za-z0-9]+', '_', 'g')),
  'tuition', 'MONTHLY'::"FeeFrequency", true, false, '', "enabled", "amountPkr", "sortOrder", "createdAt", "updatedAt"
FROM "FeeItem"
ON CONFLICT ("id") DO NOTHING;

UPDATE "Invoice" SET
  "totalAmountPkr" = "amountPkr",
  "subtotalPkr" = "amountPkr",
  "invoiceNumber" = CASE WHEN "invoiceNumber" = '' THEN "id" ELSE "invoiceNumber" END,
  "issueDate" = "createdAt",
  "dueDate" = "dueOn";

UPDATE "Invoice" AS i SET
  "paidAmountPkr" = COALESCE((SELECT SUM(p."amountPkr") FROM "Payment" p WHERE p."invoiceId" = i."id"), 0),
  "balanceAmountPkr" = i."amountPkr" - COALESCE((SELECT SUM(p."amountPkr") FROM "Payment" p WHERE p."invoiceId" = i."id"), 0);

INSERT INTO "InvoiceItem" ("id", "invoiceId", "description", "quantity", "unitAmountPkr", "grossAmountPkr", "discountAmountPkr", "taxAmountPkr", "netAmountPkr", "metadata", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, i."id", COALESCE(fp."name", 'Fee'), 1, i."amountPkr", i."amountPkr", 0, 0, i."amountPkr", '{}'::jsonb, NOW(), NOW()
FROM "Invoice" i
LEFT JOIN "FeePlan" fp ON fp."id" = i."feePlanId";

UPDATE "Payment" SET
  "paymentNumber" = CASE WHEN "paymentNumber" = '' THEN "receiptNo" ELSE "paymentNumber" END,
  "paymentDate" = "paidAt",
  "studentId" = (SELECT i."studentId" FROM "Invoice" i WHERE i."id" = "Payment"."invoiceId");

INSERT INTO "PaymentAllocation" ("id", "paymentId", "invoiceId", "amountPkr", "createdAt")
SELECT gen_random_uuid()::text, p."id", p."invoiceId", p."amountPkr", NOW()
FROM "Payment" p
WHERE p."invoiceId" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "Receipt" ("id", "schoolId", "studentId", "paymentId", "receiptNumber", "receiptDate", "amountPkr", "pdfPath", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."schoolId", p."studentId", p."id", p."receiptNo", p."paidAt", p."amountPkr", '', NOW(), NOW()
FROM "Payment" p
ON CONFLICT DO NOTHING;

INSERT INTO "SchoolFeeSettings" ("id", "schoolId", "updatedAt")
SELECT gen_random_uuid()::text, s."id", NOW()
FROM "School" s
ON CONFLICT ("schoolId") DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS "SchoolFeeSettings_schoolId_key" ON "SchoolFeeSettings"("schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "Receipt_paymentId_key" ON "Receipt"("paymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "Receipt_schoolId_receiptNumber_key" ON "Receipt"("schoolId", "receiptNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "FbrInvoice_invoiceId_key" ON "FbrInvoice"("invoiceId");
CREATE UNIQUE INDEX IF NOT EXISTS "StudentFeeOverride_assignmentId_feeHeadId_key" ON "StudentFeeOverride"("assignmentId", "feeHeadId");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentAllocation_paymentId_invoiceId_key" ON "PaymentAllocation"("paymentId", "invoiceId");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_open_period_key" ON "Invoice"("schoolId", "studentId", "billingPeriod", "feeStructureId") WHERE "status" NOT IN ('CANCELLED') AND "studentId" IS NOT NULL AND "billingPeriod" <> '' AND "feeStructureId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "FeeHead_schoolId_idx" ON "FeeHead"("schoolId");
CREATE INDEX IF NOT EXISTS "FeeHead_schoolId_code_idx" ON "FeeHead"("schoolId", "code");
CREATE INDEX IF NOT EXISTS "FeeStructure_schoolId_idx" ON "FeeStructure"("schoolId");
CREATE INDEX IF NOT EXISTS "FeeStructure_schoolId_academicYearId_className_idx" ON "FeeStructure"("schoolId", "academicYearId", "className");
CREATE INDEX IF NOT EXISTS "FeeStructureItem_feeStructureId_idx" ON "FeeStructureItem"("feeStructureId");
CREATE INDEX IF NOT EXISTS "StudentFeeAssignment_schoolId_studentId_idx" ON "StudentFeeAssignment"("schoolId", "studentId");
CREATE INDEX IF NOT EXISTS "StudentFeeAssignment_feeStructureId_idx" ON "StudentFeeAssignment"("feeStructureId");
CREATE INDEX IF NOT EXISTS "Discount_schoolId_idx" ON "Discount"("schoolId");
CREATE INDEX IF NOT EXISTS "StudentDiscount_schoolId_studentId_idx" ON "StudentDiscount"("schoolId", "studentId");
CREATE INDEX IF NOT EXISTS "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");
CREATE INDEX IF NOT EXISTS "Invoice_schoolId_billingPeriod_idx" ON "Invoice"("schoolId", "billingPeriod");
CREATE INDEX IF NOT EXISTS "Invoice_schoolId_invoiceNumber_idx" ON "Invoice"("schoolId", "invoiceNumber");
CREATE INDEX IF NOT EXISTS "Payment_studentId_idx" ON "Payment"("studentId");
CREATE INDEX IF NOT EXISTS "Payment_schoolId_paymentNumber_idx" ON "Payment"("schoolId", "paymentNumber");
CREATE INDEX IF NOT EXISTS "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");
CREATE INDEX IF NOT EXISTS "StudentCredit_schoolId_studentId_idx" ON "StudentCredit"("schoolId", "studentId");
CREATE INDEX IF NOT EXISTS "Receipt_schoolId_idx" ON "Receipt"("schoolId");
CREATE INDEX IF NOT EXISTS "Receipt_studentId_idx" ON "Receipt"("studentId");
CREATE INDEX IF NOT EXISTS "FbrInvoice_schoolId_idx" ON "FbrInvoice"("schoolId");

ALTER TABLE "FeeHead" ADD CONSTRAINT "FeeHead_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeHead" ADD CONSTRAINT "FeeHead_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeStructureItem" ADD CONSTRAINT "FeeStructureItem_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeStructureItem" ADD CONSTRAINT "FeeStructureItem_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "FeeHead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentFeeAssignment" ADD CONSTRAINT "StudentFeeAssignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentFeeAssignment" ADD CONSTRAINT "StudentFeeAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentFeeAssignment" ADD CONSTRAINT "StudentFeeAssignment_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentFeeOverride" ADD CONSTRAINT "StudentFeeOverride_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "StudentFeeAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentFeeOverride" ADD CONSTRAINT "StudentFeeOverride_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "FeeHead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentDiscount" ADD CONSTRAINT "StudentDiscount_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentDiscount" ADD CONSTRAINT "StudentDiscount_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentDiscount" ADD CONSTRAINT "StudentDiscount_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolFeeSettings" ADD CONSTRAINT "SchoolFeeSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "FeeHead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentCredit" ADD CONSTRAINT "StudentCredit_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentCredit" ADD CONSTRAINT "StudentCredit_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentCredit" ADD CONSTRAINT "StudentCredit_sourcePaymentId_fkey" FOREIGN KEY ("sourcePaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FbrInvoice" ADD CONSTRAINT "FbrInvoice_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FbrInvoice" ADD CONSTRAINT "FbrInvoice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
