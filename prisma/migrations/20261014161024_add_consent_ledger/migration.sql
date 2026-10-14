-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('PUSH', 'EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('SIGNUP', 'USER_TOGGLE', 'UNSUBSCRIBE_LINK', 'ADMIN_OVERRIDE');

-- CreateTable
CREATE TABLE "ConsentLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "consentGranted" BOOLEAN NOT NULL,
    "source" "ConsentSource" NOT NULL DEFAULT 'USER_TOGGLE',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentLedger_userId_createdAt_idx" ON "ConsentLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentLedger_userId_channel_createdAt_idx" ON "ConsentLedger"("userId", "channel", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ConsentLedger" ADD CONSTRAINT "ConsentLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
