/*
  Warnings:

  - Added the required column `transactionType` to the `CreditLedger` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('CREDIT', 'DEBIT');

-- AlterTable
-- 1. Add the column without the NOT NULL constraint
ALTER TABLE "CreditLedger" ADD COLUMN "transactionType" "CreditTransactionType";

-- 2. Populate the transactionType based on existing amount signs, and convert amount to ABS
UPDATE "CreditLedger" SET "transactionType" = 'CREDIT' WHERE "amount" >= 0;
UPDATE "CreditLedger" SET "transactionType" = 'DEBIT', "amount" = ABS("amount") WHERE "amount" < 0;

-- 3. Now enforce the NOT NULL constraint
ALTER TABLE "CreditLedger" ALTER COLUMN "transactionType" SET NOT NULL;
