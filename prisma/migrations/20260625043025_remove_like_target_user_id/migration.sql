/*
  Warnings:

  - You are about to drop the column `targetUserId` on the `Like` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_targetUserId_fkey";

-- DropIndex
DROP INDEX "Like_targetUserId_idx";

-- AlterTable
ALTER TABLE "Like" DROP COLUMN "targetUserId";
