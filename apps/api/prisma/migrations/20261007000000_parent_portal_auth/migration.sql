-- CreateTable
CREATE TABLE "ParentUser" (
    "id" TEXT NOT NULL,
    "phoneNorm" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentDevice" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "phoneNorm" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT true,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParentUser_phoneNorm_key" ON "ParentUser"("phoneNorm");

-- CreateIndex
CREATE UNIQUE INDEX "ParentDevice_tokenHash_key" ON "ParentDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "ParentDevice_parentId_idx" ON "ParentDevice"("parentId");

-- CreateIndex
CREATE INDEX "OtpChallenge_phoneNorm_createdAt_idx" ON "OtpChallenge"("phoneNorm", "createdAt");

-- AddForeignKey
ALTER TABLE "ParentDevice" ADD CONSTRAINT "ParentDevice_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ParentUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
