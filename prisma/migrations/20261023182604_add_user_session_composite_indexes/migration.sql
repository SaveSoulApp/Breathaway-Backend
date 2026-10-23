-- CreateIndex
CREATE INDEX "UserSession_userId_revokedAt_expiresAt_idx" ON "UserSession"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "UserSession_userId_familyId_revokedAt_idx" ON "UserSession"("userId", "familyId", "revokedAt");
