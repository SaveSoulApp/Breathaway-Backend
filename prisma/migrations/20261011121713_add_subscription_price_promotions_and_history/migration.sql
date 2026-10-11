/*
  Warnings:

  - You are about to drop the column `price` on the `SubscriptionPlanPrice` table. All the data in the column will be lost.
  - Added the required column `originalPrice` to the `SubscriptionPlanPrice` table without a default value. This is not possible if the table is not empty.

*/
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
    "priceId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "currencyCode" "CurrencyCode" NOT NULL,
    "originalPrice" DECIMAL(10,2) NOT NULL,
    "discountedPrice" DECIMAL(10,2),
    "discountStartsAt" TIMESTAMPTZ,
    "discountEndsAt" TIMESTAMPTZ,
    "effectiveFrom" TIMESTAMPTZ NOT NULL,
    "effectiveTo" TIMESTAMPTZ,
    "changeType" TEXT NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "changeReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPlanPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionPlanPriceHistory_planId_countryCode_effectiveFr_idx" ON "SubscriptionPlanPriceHistory"("planId", "countryCode", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "SubscriptionPlanPriceHistory_priceId_effectiveFrom_idx" ON "SubscriptionPlanPriceHistory"("priceId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "SubscriptionPlanPrice_discountStartsAt_discountEndsAt_idx" ON "SubscriptionPlanPrice"("discountStartsAt", "discountEndsAt");

-- AddForeignKey
ALTER TABLE "SubscriptionPlanPriceHistory" ADD CONSTRAINT "SubscriptionPlanPriceHistory_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "SubscriptionPlanPrice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
