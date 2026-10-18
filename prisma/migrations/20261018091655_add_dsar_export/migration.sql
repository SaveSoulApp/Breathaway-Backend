-- CreateEnum
CREATE TYPE "DsarExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "DsarExport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DsarExportStatus" NOT NULL DEFAULT 'PENDING',
    "storagePath" TEXT,
    "fileSizeBytes" BIGINT,
    "checksumSha256" TEXT,
    "errorMessage" TEXT,
    "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ,
    "expiresAt" TIMESTAMPTZ,

    CONSTRAINT "DsarExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DsarExport_userId_requestedAt_idx" ON "DsarExport"("userId", "requestedAt" DESC);

-- CreateIndex
CREATE INDEX "DsarExport_status_idx" ON "DsarExport"("status");

-- AddForeignKey
ALTER TABLE "DsarExport" ADD CONSTRAINT "DsarExport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
