-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'CANCELLATION_POLICY');

-- CreateEnum
CREATE TYPE "LegalConsentContext" AS ENUM ('SIGNUP', 'SIGNIN_REACCEPTANCE', 'IN_APP_REACCEPTANCE');

-- CreateTable
CREATE TABLE "LegalDocumentVersion" (
    "id" TEXT NOT NULL,
    "type" "LegalDocumentType" NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "documentUrl" VARCHAR(512) NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "snapshotStoragePath" VARCHAR(512),
    "requiresReacceptance" BOOLEAN NOT NULL DEFAULT false,
    "changeSummary" TEXT,
    "publishedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveAt" TIMESTAMPTZ NOT NULL,
    "supersededAt" TIMESTAMPTZ,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "LegalDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLegalConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "documentType" "LegalDocumentType" NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "context" "LegalConsentContext" NOT NULL DEFAULT 'SIGNUP',
    "platform" "DevicePlatform" NOT NULL DEFAULT 'WEB',
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLegalConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalDocumentVersion_type_isActive_effectiveAt_idx" ON "LegalDocumentVersion"("type", "isActive", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocumentVersion_type_version_key" ON "LegalDocumentVersion"("type", "version");

-- CreateIndex
CREATE INDEX "UserLegalConsent_userId_acceptedAt_idx" ON "UserLegalConsent"("userId", "acceptedAt" DESC);

-- CreateIndex
CREATE INDEX "UserLegalConsent_userId_documentType_acceptedAt_idx" ON "UserLegalConsent"("userId", "documentType", "acceptedAt" DESC);

-- CreateIndex
CREATE INDEX "UserLegalConsent_documentVersionId_idx" ON "UserLegalConsent"("documentVersionId");

-- AddForeignKey
ALTER TABLE "UserLegalConsent" ADD CONSTRAINT "UserLegalConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLegalConsent" ADD CONSTRAINT "UserLegalConsent_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
