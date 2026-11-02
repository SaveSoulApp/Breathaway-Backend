/*
  Warnings:

  - Changed the type of `tokenHash` on the `UserSession` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "UserSession" DROP COLUMN "tokenHash",
ADD COLUMN     "tokenHash" BYTEA NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");
