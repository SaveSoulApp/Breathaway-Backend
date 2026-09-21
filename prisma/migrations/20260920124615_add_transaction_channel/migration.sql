-- CreateEnum
CREATE TYPE "TransactionChannel" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentGateway" ADD VALUE 'CASHFREE';
ALTER TYPE "PaymentGateway" ADD VALUE 'EASEBUZZ';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "channel" "TransactionChannel";

-- CreateIndex
CREATE INDEX "Transaction_channel_idx" ON "Transaction"("channel");

-- CreateIndex
CREATE INDEX "Transaction_channel_occurredAt_idx" ON "Transaction"("channel", "occurredAt");
