-- DropForeignKey
ALTER TABLE "Block" DROP CONSTRAINT "Block_blockedUserId_fkey";

-- AlterTable
ALTER TABLE "Block" ADD COLUMN     "blockedPhoneHash" CHAR(64),
ALTER COLUMN "blockedUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "userPhoneHash" CHAR(64);

-- CreateIndex
CREATE INDEX "Block_blockerUserId_blockedPhoneHash_deletedAt_idx" ON "Block"("blockerUserId", "blockedPhoneHash", "deletedAt");

-- CreateIndex
CREATE INDEX "Block_blockedPhoneHash_deletedAt_idx" ON "Block"("blockedPhoneHash", "deletedAt");

-- CreateIndex
CREATE INDEX "Transaction_userPhoneHash_idx" ON "Transaction"("userPhoneHash");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
