-- AlterTable
ALTER TABLE "User" ADD COLUMN     "countryCode" CHAR(2);

-- CreateIndex
CREATE INDEX "User_countryCode_idx" ON "User"("countryCode");
