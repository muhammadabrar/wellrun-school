-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('CASH', 'BANK');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('PAYMENT', 'RECEIPT', 'TRANSFER');

-- CreateEnum
CREATE TYPE "VoucherSource" AS ENUM ('MANUAL', 'INVENTORY');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('ASSET', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('IN_USE', 'REPAIR', 'DISPOSED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('PURCHASE', 'ISSUE', 'RETURN', 'DAMAGE', 'ADJUST');

-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "openingBalancePkr" INTEGER NOT NULL DEFAULT 0,
    "openingOn" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "systemKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "VoucherType" NOT NULL,
    "date" DATE NOT NULL,
    "amountPkr" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "toAccountId" TEXT,
    "categoryId" TEXT,
    "party" TEXT NOT NULL DEFAULT '',
    "method" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "source" "VoucherSource" NOT NULL DEFAULT 'MANUAL',
    "sourceId" TEXT,
    "status" "VoucherStatus" NOT NULL DEFAULT 'POSTED',
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "kind" "ItemKind" NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "location" TEXT NOT NULL DEFAULT '',
    "reorderLevel" INTEGER,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "unitCostPkr" INTEGER NOT NULL DEFAULT 0,
    "status" "ItemStatus" NOT NULL DEFAULT 'IN_USE',
    "serialNo" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostPkr" INTEGER,
    "totalCostPkr" INTEGER NOT NULL DEFAULT 0,
    "date" DATE NOT NULL,
    "supplier" TEXT NOT NULL DEFAULT '',
    "issuedTo" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "voucherId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceAccount_schoolId_idx" ON "FinanceAccount"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_schoolId_name_key" ON "FinanceAccount"("schoolId", "name");

-- CreateIndex
CREATE INDEX "FinanceCategory_schoolId_idx" ON "FinanceCategory"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_schoolId_kind_name_key" ON "FinanceCategory"("schoolId", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_schoolId_systemKey_key" ON "FinanceCategory"("schoolId", "systemKey");

-- CreateIndex
CREATE INDEX "Voucher_schoolId_date_idx" ON "Voucher"("schoolId", "date");

-- CreateIndex
CREATE INDEX "Voucher_accountId_date_idx" ON "Voucher"("accountId", "date");

-- CreateIndex
CREATE INDEX "Voucher_sourceId_idx" ON "Voucher"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_schoolId_number_key" ON "Voucher"("schoolId", "number");

-- CreateIndex
CREATE INDEX "InventoryItem_schoolId_kind_idx" ON "InventoryItem"("schoolId", "kind");

-- CreateIndex
CREATE INDEX "InventoryItem_schoolId_name_idx" ON "InventoryItem"("schoolId", "name");

-- CreateIndex
CREATE INDEX "InventoryMovement_itemId_date_idx" ON "InventoryMovement"("itemId", "date");

-- CreateIndex
CREATE INDEX "InventoryMovement_schoolId_date_idx" ON "InventoryMovement"("schoolId", "date");

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

