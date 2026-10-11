/*
  Warnings:

  - You are about to drop the column `price` on the `SubscriptionPlanPrice` table. All the data in the column will be lost.
  - Added the required column `originalPrice` to the `SubscriptionPlanPrice` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SubscriptionPriceChangeType" AS ENUM ('INITIAL_PRICE', 'BASE_PRICE_INCREASE', 'BASE_PRICE_DECREASE', 'PROMO_SCHEDULED', 'PROMO_ENDED', 'PROMO_UPDATED', 'PRICE_UPDATED', 'PRICE_DELETED');

-- AlterTable
ALTER TABLE "PaymentOrder" ADD COLUMN     "discountAmount" INTEGER DEFAULT 0,
ADD COLUMN     "originalAmount" INTEGER;

-- AlterTable
ALTER TABLE "SubscriptionPlanPrice" DROP COLUMN "price",
ADD COLUMN     "discountEndsAt" TIMESTAMPTZ,
ADD COLUMN     "discountStartsAt" TIMESTAMPTZ,
ADD COLUMN     "discountedPrice" DECIMAL(10,2),
ADD COLUMN     "originalPrice" DECIMAL(10,2) NOT NULL;

-- CreateTable
CREATE TABLE "SubscriptionPlanPriceHistory" (
    "id" TEXT NOT NULL,
    "priceId" TEXT,
    "planId" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "currencyCode" "CurrencyCode" NOT NULL,
    "originalPrice" DECIMAL(10,2) NOT NULL,
    "discountedPrice" DECIMAL(10,2),
    "discountStartsAt" TIMESTAMPTZ,
    "discountEndsAt" TIMESTAMPTZ,
    "effectiveFrom" TIMESTAMPTZ NOT NULL,
    "effectiveTo" TIMESTAMPTZ,
    "changeType" "SubscriptionPriceChangeType" NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "changeReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPlanPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionPlanPriceHistory_planId_countryCode_effectiveFr_idx" ON "SubscriptionPlanPriceHistory"("planId", "countryCode", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "SubscriptionPlanPriceHistory_planId_effectiveFrom_effectiveTo_idx" ON "SubscriptionPlanPriceHistory"("planId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "SubscriptionPlanPriceHistory_priceId_effectiveFrom_idx" ON "SubscriptionPlanPriceHistory"("priceId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "SubscriptionPlanPrice_discountStartsAt_discountEndsAt_idx" ON "SubscriptionPlanPrice"("discountStartsAt", "discountEndsAt");

-- AddForeignKey
ALTER TABLE "SubscriptionPlanPriceHistory" ADD CONSTRAINT "SubscriptionPlanPriceHistory_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "SubscriptionPlanPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlanPriceHistory" ADD CONSTRAINT "SubscriptionPlanPriceHistory_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
