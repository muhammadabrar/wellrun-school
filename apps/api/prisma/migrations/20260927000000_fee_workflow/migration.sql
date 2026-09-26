-- Receipts snapshot the student's balance at the moment of payment, so a reprint later
-- still shows the same "previous balance / remaining balance" the parent was given.
ALTER TABLE "Receipt" ADD COLUMN "previousBalancePkr" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Receipt" ADD COLUMN "remainingBalancePkr" INTEGER NOT NULL DEFAULT 0;

-- Fee structures are named after their class ("Grade 1"), not "Grade 1 monthly fee".
UPDATE "FeeStructure" SET "name" = "className"
WHERE "className" <> '' AND "name" = "className" || ' monthly fee';
