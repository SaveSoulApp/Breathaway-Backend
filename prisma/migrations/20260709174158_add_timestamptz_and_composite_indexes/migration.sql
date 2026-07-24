/*
  Warnings:

  - A unique constraint covering the columns `[valueHash,deletedAt]` on the table `AuthCredential` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,type,deletedAt]` on the table `AuthCredential` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "AuthCredential_userId_idx";

-- DropIndex
DROP INDEX "AuthCredential_userId_type_key";

-- DropIndex
DROP INDEX "AuthCredential_valueHash_key";

-- DropIndex
DROP INDEX "Identity_userId_idx";

-- DropIndex
DROP INDEX "Like_senderUserId_idx";

-- DropIndex
DROP INDEX "Match_userOneId_idx";

-- DropIndex
DROP INDEX "Match_userTwoId_idx";

-- AlterTable
ALTER TABLE "AuthCredential" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "Block" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "CreditLedger" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "Device" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "Identity" ALTER COLUMN "verifiedAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "Like" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "Match" ALTER COLUMN "matchedAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "NotificationPreference" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "SubscriptionEvent" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "SubscriptionPlanPrice" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "UserProfile" ALTER COLUMN "dateOfBirth" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "UserSubscription" ALTER COLUMN "currentPeriodStart" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "currentPeriodEnd" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "trialEnd" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "cancelledAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "AuthCredential_userId_deletedAt_idx" ON "AuthCredential"("userId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthCredential_valueHash_deletedAt_key" ON "AuthCredential"("valueHash", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthCredential_userId_type_deletedAt_key" ON "AuthCredential"("userId", "type", "deletedAt");

-- CreateIndex
CREATE INDEX "Block_blockerUserId_deletedAt_createdAt_idx" ON "Block"("blockerUserId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Identity_userId_deletedAt_createdAt_idx" ON "Identity"("userId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Like_senderUserId_deletedAt_status_idx" ON "Like"("senderUserId", "deletedAt", "status");

-- CreateIndex
CREATE INDEX "Match_userOneId_deletedAt_idx" ON "Match"("userOneId", "deletedAt");

-- CreateIndex
CREATE INDEX "Match_userTwoId_deletedAt_idx" ON "Match"("userTwoId", "deletedAt");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
