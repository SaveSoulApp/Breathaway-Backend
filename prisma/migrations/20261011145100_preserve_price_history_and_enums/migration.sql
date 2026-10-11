-- CreateEnum
CREATE TYPE "SubscriptionPriceChangeType" AS ENUM ('INITIAL_PRICE', 'BASE_PRICE_INCREASE', 'BASE_PRICE_DECREASE', 'PROMO_SCHEDULED', 'PROMO_ENDED', 'PROMO_UPDATED', 'PRICE_UPDATED', 'PRICE_DELETED');

-- DropForeignKey
ALTER TABLE "SubscriptionPlanPriceHistory" DROP CONSTRAINT "SubscriptionPlanPriceHistory_priceId_fkey";

-- AlterTable
ALTER TABLE "SubscriptionPlanPriceHistory" ALTER COLUMN "priceId" DROP NOT NULL,
ALTER COLUMN "changeType" TYPE "SubscriptionPriceChangeType" USING ("changeType"::"SubscriptionPriceChangeType");

-- CreateIndex
CREATE INDEX "SubscriptionPlanPriceHistory_planId_effectiveFrom_effectiveTo_idx" ON "SubscriptionPlanPriceHistory"("planId", "effectiveFrom", "effectiveTo");

-- AddForeignKey
ALTER TABLE "SubscriptionPlanPriceHistory" ADD CONSTRAINT "SubscriptionPlanPriceHistory_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "SubscriptionPlanPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlanPriceHistory" ADD CONSTRAINT "SubscriptionPlanPriceHistory_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
