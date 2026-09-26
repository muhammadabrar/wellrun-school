-- Fee generation correctness fixes: opt-in auto-generation flag, and a DB-level guard
-- against double-billing a student for the same recurring billing period.

ALTER TABLE "SchoolFeeSettings" ADD COLUMN "autoGenerateEnabled" BOOLEAN NOT NULL DEFAULT false;

-- One active (non-cancelled/draft) recurring invoice per student per billing period.
-- Deliberately not scoped by feeStructureId, so a student whose fee structure changed
-- mid-period (e.g. after a class promotion) is still caught as already billed.
-- Scoped to "YYYY-MM" billing periods only (regex) so it can never collide with the
-- one-time admission invoices, whose billingPeriod is "ADM-<applicationNo>".
CREATE UNIQUE INDEX "Invoice_student_period_active_key"
ON "Invoice" ("studentId", "billingPeriod")
WHERE "studentId" IS NOT NULL
  AND "billingPeriod" ~ '^[0-9]{4}-[0-9]{2}$'
  AND "status" NOT IN ('CANCELLED', 'DRAFT');
