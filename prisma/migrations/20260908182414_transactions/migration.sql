-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('REVENUECAT', 'RAZORPAY');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('PURCHASE', 'REFUND');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TransactionEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "gateway" "PaymentGateway" NOT NULL,
    "gatewayTransactionId" TEXT NOT NULL,
    "gatewayEventId" TEXT,
    "gatewayUserId" TEXT,
    "type" "TransactionType" NOT NULL DEFAULT 'PURCHASE',
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "environment" "TransactionEnvironment" NOT NULL,
    "productId" TEXT NOT NULL,
    "creditsGranted" INTEGER,
    "amount" DECIMAL(12,2),
    "currency" CHAR(3),
    "countryCode" CHAR(2),
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_gateway_gatewayEventId_idx" ON "Transaction"("gateway", "gatewayEventId");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_occurredAt_idx" ON "Transaction"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_gateway_gatewayTransactionId_key" ON "Transaction"("gateway", "gatewayTransactionId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

