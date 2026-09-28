-- A payment submitted twice (double click, slow network, retry) carries the same requestId,
-- so the second submit returns the first payment instead of charging the family again.
ALTER TABLE "Payment" ADD COLUMN "requestId" TEXT;
CREATE UNIQUE INDEX "Payment_schoolId_requestId_key" ON "Payment"("schoolId", "requestId");
