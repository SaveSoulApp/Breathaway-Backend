/*
  Warnings:

  - The `blockedPhoneHash` column on the `Block` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `platformIdHash` column on the `Identity` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `platformIdCiphertext` column on the `Identity` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `platformIdIv` column on the `Identity` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `platformIdTag` column on the `Identity` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `platformIdWrappedKey` column on the `Identity` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `userPhoneHash` column on the `Transaction` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `valueHash` on the `AuthCredential` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `publicValueHash` on the `Identity` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `publicValueCiphertext` on the `Identity` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `publicValueIv` on the `Identity` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `publicValueTag` on the `Identity` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `publicValueWrappedKey` on the `Identity` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "AuthCredential" DROP COLUMN "valueHash",
ADD COLUMN     "valueHash" BYTEA NOT NULL;

-- AlterTable
ALTER TABLE "Block" DROP COLUMN "blockedPhoneHash",
ADD COLUMN     "blockedPhoneHash" BYTEA;

-- AlterTable
ALTER TABLE "Identity" DROP COLUMN "publicValueHash",
ADD COLUMN     "publicValueHash" BYTEA NOT NULL,
DROP COLUMN "publicValueCiphertext",
ADD COLUMN     "publicValueCiphertext" BYTEA NOT NULL,
DROP COLUMN "publicValueIv",
ADD COLUMN     "publicValueIv" BYTEA NOT NULL,
DROP COLUMN "publicValueTag",
ADD COLUMN     "publicValueTag" BYTEA NOT NULL,
DROP COLUMN "publicValueWrappedKey",
ADD COLUMN     "publicValueWrappedKey" BYTEA NOT NULL,
DROP COLUMN "platformIdHash",
ADD COLUMN     "platformIdHash" BYTEA,
DROP COLUMN "platformIdCiphertext",
ADD COLUMN     "platformIdCiphertext" BYTEA,
DROP COLUMN "platformIdIv",
ADD COLUMN     "platformIdIv" BYTEA,
DROP COLUMN "platformIdTag",
ADD COLUMN     "platformIdTag" BYTEA,
DROP COLUMN "platformIdWrappedKey",
ADD COLUMN     "platformIdWrappedKey" BYTEA;

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "userPhoneHash",
ADD COLUMN     "userPhoneHash" BYTEA;

-- CreateIndex
CREATE UNIQUE INDEX "AuthCredential_valueHash_deletedAt_key" ON "AuthCredential"("valueHash", "deletedAt");

-- CreateIndex
CREATE INDEX "Block_blockerUserId_blockedPhoneHash_deletedAt_idx" ON "Block"("blockerUserId", "blockedPhoneHash", "deletedAt");

-- CreateIndex
CREATE INDEX "Block_blockedPhoneHash_deletedAt_idx" ON "Block"("blockedPhoneHash", "deletedAt");

-- CreateIndex
CREATE INDEX "Identity_platformIdHash_idx" ON "Identity"("platformIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "Identity_type_publicValueHash_key" ON "Identity"("type", "publicValueHash");

-- CreateIndex
CREATE UNIQUE INDEX "Identity_type_platformIdHash_key" ON "Identity"("type", "platformIdHash");

-- CreateIndex
CREATE INDEX "Transaction_userPhoneHash_idx" ON "Transaction"("userPhoneHash");
