-- CreateIndex
CREATE INDEX "CreditLedger_userId_transactionType_expiresAt_idx" ON "CreditLedger"("userId", "transactionType", "expiresAt");

-- CreateIndex
CREATE INDEX "CreditLedger_transactionType_expiresAt_userId_idx" ON "CreditLedger"("transactionType", "expiresAt", "userId");
