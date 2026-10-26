-- CreateEnum
CREATE TYPE "IdentityType" AS ENUM ('PHONE', 'EMAIL', 'INSTAGRAM', 'LINKEDIN', 'TWITTER', 'OTHER');

-- CreateEnum
CREATE TYPE "AuthCredentialType" AS ENUM ('PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "IntentType" AS ENUM ('RELATIONSHIP', 'CASUAL', 'OPEN');

-- CreateEnum
CREATE TYPE "LikeStatus" AS ENUM ('PENDING', 'MATCHED', 'VOIDED', 'WITHDRAWN', 'DELETED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('ACTIVE', 'UNMATCHED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "CreditSource" AS ENUM ('PURCHASE', 'BONUS', 'REFERRAL', 'LIKE_USAGE', 'ADMIN', 'EXPIRED', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "GenderType" AS ENUM ('MALE', 'FEMALE', 'NONBINARY', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('PUSH', 'EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('SIGNUP', 'USER_TOGGLE', 'UNSUBSCRIBE_LINK', 'ADMIN_OVERRIDE');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('REVENUECAT', 'RAZORPAY', 'CASHFREE', 'EASEBUZZ', 'DECENTRO');

-- CreateEnum
CREATE TYPE "TransactionChannel" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('PURCHASE', 'REFUND');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TransactionEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SubscriptionPlanStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'GRACE_PERIOD', 'REVOKED', 'PAUSED');

-- CreateEnum
CREATE TYPE "StorePlatform" AS ENUM ('APPLE', 'GOOGLE');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('INR', 'USD', 'SGD', 'AED', 'GBP', 'EUR', 'AUD');

-- CreateEnum
CREATE TYPE "SubscriptionEventType" AS ENUM ('INITIAL_PURCHASE', 'RENEWAL', 'CANCELLATION', 'GRACE_PERIOD_ENTERED', 'BILLING_RECOVERY', 'REVOCATION', 'REFUND', 'PRICE_CHANGE_CONFIRMED', 'EXPIRY');

-- CreateEnum
CREATE TYPE "SubscriptionPriceChangeType" AS ENUM ('INITIAL_PRICE', 'BASE_PRICE_INCREASE', 'BASE_PRICE_DECREASE', 'PROMO_SCHEDULED', 'PROMO_ENDED', 'PROMO_UPDATED', 'PRICE_UPDATED', 'PRICE_DELETED');

-- CreateEnum
CREATE TYPE "DsarExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "countryCode" CHAR(2),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "dateOfBirth" TIMESTAMPTZ,
    "gender" "GenderType",
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AuthCredentialType" NOT NULL,
    "valueHash" CHAR(64) NOT NULL,
    "valueMasked" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "identityId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "AuthCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Identity" (
    "id" TEXT NOT NULL,
    "type" "IdentityType" NOT NULL,
    "publicValueHash" CHAR(64) NOT NULL,
    "publicValueCiphertext" TEXT NOT NULL,
    "publicValueIv" CHAR(24) NOT NULL,
    "publicValueTag" CHAR(24) NOT NULL,
    "publicValueWrappedKey" TEXT NOT NULL,
    "publicValueKeyId" TEXT NOT NULL,
    "publicValueMasked" TEXT,
    "platformIdHash" CHAR(64),
    "platformIdCiphertext" TEXT,
    "platformIdIv" CHAR(24),
    "platformIdTag" CHAR(24),
    "platformIdWrappedKey" TEXT,
    "platformIdKeyId" TEXT,
    "userId" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Like" (
    "id" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "targetIdentityId" TEXT NOT NULL,
    "intent" "IntentType" NOT NULL,
    "status" "LikeStatus" NOT NULL DEFAULT 'PENDING',
    "label" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "userOneId" TEXT NOT NULL,
    "userTwoId" TEXT NOT NULL,
    "likeOneId" TEXT NOT NULL,
    "likeTwoId" TEXT NOT NULL,
    "intentOne" "IntentType" NOT NULL,
    "intentTwo" "IntentType" NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "matchedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "blockerUserId" TEXT NOT NULL,
    "blockedUserId" TEXT,
    "blockedPhoneHash" CHAR(64),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "deviceId" TEXT,
    "appVersion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "familyId" TEXT NOT NULL,
    "deviceId" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "revokedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionType" "CreditTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" "CreditSource" NOT NULL,
    "referenceId" TEXT,
    "expiresAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userPhoneHash" CHAR(64),
    "gateway" "PaymentGateway" NOT NULL,
    "gatewayTransactionId" TEXT NOT NULL,
    "gatewayEventId" TEXT,
    "gatewayUserId" TEXT,
    "type" "TransactionType" NOT NULL DEFAULT 'PURCHASE',
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "environment" "TransactionEnvironment" NOT NULL,
    "channel" "TransactionChannel",
    "productId" TEXT NOT NULL,
    "creditsGranted" INTEGER,
    "amount" DECIMAL(12,2),
    "currency" CHAR(3),
    "countryCode" CHAR(2),
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "originalAmount" INTEGER,
    "discountAmount" INTEGER DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'PENDING',
    "gatewayOrderId" TEXT NOT NULL,
    "transactionId" TEXT,
    "gatewayCreatedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentGatewayRoute" (
    "id" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minAmount" INTEGER,
    "maxAmount" INTEGER,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PaymentGatewayRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "appleProductId" TEXT,
    "googleProductId" TEXT,
    "creditsGranted" INTEGER NOT NULL,
    "validityDays" INTEGER NOT NULL,
    "trialDurationDays" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "SubscriptionPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlanPrice" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "currencyCode" "CurrencyCode" NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "originalPrice" DECIMAL(10,2) NOT NULL,
    "discountedPrice" DECIMAL(10,2),
    "discountStartsAt" TIMESTAMPTZ,
    "discountEndsAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "SubscriptionPlanPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlanPriceHistory" (
    "id" TEXT NOT NULL,
    "priceId" TEXT,
    "planId" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "currencyCode" "CurrencyCode" NOT NULL,
    "originalPrice" DECIMAL(10,2) NOT NULL,
    "discountedPrice" DECIMAL(10,2),
    "discountStartsAt" TIMESTAMPTZ,
    "discountEndsAt" TIMESTAMPTZ,
    "effectiveFrom" TIMESTAMPTZ NOT NULL,
    "effectiveTo" TIMESTAMPTZ,
    "changeType" "SubscriptionPriceChangeType" NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "changeReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPlanPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "storePlatform" "StorePlatform" NOT NULL,
    "storeTransactionId" TEXT,
    "storeProductId" TEXT,
    "currentPeriodStart" TIMESTAMPTZ NOT NULL,
    "currentPeriodEnd" TIMESTAMPTZ NOT NULL,
    "trialEnd" TIMESTAMPTZ,
    "autoRenewing" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMPTZ,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "currencyCode" "CurrencyCode",
    "pricePaid" DECIMAL(10,2),
    "countryCode" CHAR(2),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "eventType" "SubscriptionEventType" NOT NULL,
    "storePlatform" "StorePlatform" NOT NULL,
    "storeEventId" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoom" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userOneId" TEXT NOT NULL,
    "userTwoId" TEXT NOT NULL,
    "wrappedRoomKey" TEXT NOT NULL,
    "roomKeyId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roomId" UUID NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "priority" VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "action" TEXT,
    "link" TEXT,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMPTZ,
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DsarExport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DsarExportStatus" NOT NULL DEFAULT 'PENDING',
    "storagePath" TEXT,
    "fileSizeBytes" BIGINT,
    "checksumSha256" TEXT,
    "errorMessage" TEXT,
    "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ,
    "expiresAt" TIMESTAMPTZ,

    CONSTRAINT "DsarExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "User_countryCode_idx" ON "User"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthCredential_identityId_key" ON "AuthCredential"("identityId");

-- CreateIndex
CREATE INDEX "AuthCredential_userId_deletedAt_idx" ON "AuthCredential"("userId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthCredential_valueHash_deletedAt_key" ON "AuthCredential"("valueHash", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthCredential_userId_type_deletedAt_key" ON "AuthCredential"("userId", "type", "deletedAt");

-- CreateIndex
CREATE INDEX "Identity_userId_deletedAt_createdAt_idx" ON "Identity"("userId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Identity_platformIdHash_idx" ON "Identity"("platformIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "Identity_type_publicValueHash_key" ON "Identity"("type", "publicValueHash");

-- CreateIndex
CREATE UNIQUE INDEX "Identity_type_platformIdHash_key" ON "Identity"("type", "platformIdHash");

-- CreateIndex
CREATE INDEX "Like_senderUserId_deletedAt_status_idx" ON "Like"("senderUserId", "deletedAt", "status");

-- CreateIndex
CREATE INDEX "Like_targetIdentityId_idx" ON "Like"("targetIdentityId");

-- CreateIndex
CREATE INDEX "Like_status_idx" ON "Like"("status");

-- CreateIndex
CREATE INDEX "Like_expiresAt_idx" ON "Like"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Like_senderUserId_targetIdentityId_key" ON "Like"("senderUserId", "targetIdentityId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_likeOneId_key" ON "Match"("likeOneId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_likeTwoId_key" ON "Match"("likeTwoId");

-- CreateIndex
CREATE INDEX "Match_userOneId_deletedAt_idx" ON "Match"("userOneId", "deletedAt");

-- CreateIndex
CREATE INDEX "Match_userTwoId_deletedAt_idx" ON "Match"("userTwoId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Match_userOneId_userTwoId_key" ON "Match"("userOneId", "userTwoId");

-- CreateIndex
CREATE INDEX "Block_blockerUserId_deletedAt_createdAt_idx" ON "Block"("blockerUserId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Block_blockerUserId_blockedPhoneHash_deletedAt_idx" ON "Block"("blockerUserId", "blockedPhoneHash", "deletedAt");

-- CreateIndex
CREATE INDEX "Block_blockedPhoneHash_deletedAt_idx" ON "Block"("blockedPhoneHash", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Block_blockerUserId_blockedUserId_key" ON "Block"("blockerUserId", "blockedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_token_key" ON "Device"("token");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_jti_key" ON "UserSession"("jti");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_familyId_idx" ON "UserSession"("familyId");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "UserSession_userId_revokedAt_expiresAt_idx" ON "UserSession"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "UserSession_userId_familyId_revokedAt_idx" ON "UserSession"("userId", "familyId", "revokedAt");

-- CreateIndex
CREATE INDEX "CreditLedger_userId_idx" ON "CreditLedger"("userId");

-- CreateIndex
CREATE INDEX "CreditLedger_userId_createdAt_idx" ON "CreditLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedger_expiresAt_idx" ON "CreditLedger"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "ConsentLedger_userId_createdAt_idx" ON "ConsentLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentLedger_userId_channel_createdAt_idx" ON "ConsentLedger"("userId", "channel", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_userPhoneHash_idx" ON "Transaction"("userPhoneHash");

-- CreateIndex
CREATE INDEX "Transaction_gateway_gatewayEventId_idx" ON "Transaction"("gateway", "gatewayEventId");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_occurredAt_idx" ON "Transaction"("occurredAt");

-- CreateIndex
CREATE INDEX "Transaction_channel_idx" ON "Transaction"("channel");

-- CreateIndex
CREATE INDEX "Transaction_channel_occurredAt_idx" ON "Transaction"("channel", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_gateway_gatewayTransactionId_key" ON "Transaction"("gateway", "gatewayTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_transactionId_key" ON "PaymentOrder"("transactionId");

-- CreateIndex
CREATE INDEX "PaymentOrder_userId_idx" ON "PaymentOrder"("userId");

-- CreateIndex
CREATE INDEX "PaymentOrder_status_idx" ON "PaymentOrder"("status");

-- CreateIndex
CREATE INDEX "PaymentOrder_status_createdAt_idx" ON "PaymentOrder"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_gateway_gatewayOrderId_key" ON "PaymentOrder"("gateway", "gatewayOrderId");

-- CreateIndex
CREATE INDEX "PaymentGatewayRoute_countryCode_enabled_priority_idx" ON "PaymentGatewayRoute"("countryCode", "enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentGatewayRoute_countryCode_gateway_key" ON "PaymentGatewayRoute"("countryCode", "gateway");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_slug_key" ON "SubscriptionPlan"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_appleProductId_key" ON "SubscriptionPlan"("appleProductId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_googleProductId_key" ON "SubscriptionPlan"("googleProductId");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_status_idx" ON "SubscriptionPlan"("status");

-- CreateIndex
CREATE INDEX "SubscriptionPlanPrice_countryCode_idx" ON "SubscriptionPlanPrice"("countryCode");

-- CreateIndex
CREATE INDEX "SubscriptionPlanPrice_discountStartsAt_discountEndsAt_idx" ON "SubscriptionPlanPrice"("discountStartsAt", "discountEndsAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlanPrice_planId_currencyCode_countryCode_key" ON "SubscriptionPlanPrice"("planId", "currencyCode", "countryCode");

-- CreateIndex
CREATE INDEX "SubscriptionPlanPriceHistory_planId_countryCode_effectiveFr_idx" ON "SubscriptionPlanPriceHistory"("planId", "countryCode", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "SubscriptionPlanPriceHistory_planId_effectiveFrom_effective_idx" ON "SubscriptionPlanPriceHistory"("planId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "SubscriptionPlanPriceHistory_priceId_effectiveFrom_idx" ON "SubscriptionPlanPriceHistory"("priceId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "UserSubscription_userId_idx" ON "UserSubscription"("userId");

-- CreateIndex
CREATE INDEX "UserSubscription_status_idx" ON "UserSubscription"("status");

-- CreateIndex
CREATE INDEX "UserSubscription_storeTransactionId_idx" ON "UserSubscription"("storeTransactionId");

-- CreateIndex
CREATE INDEX "UserSubscription_expiresAt_idx" ON "UserSubscription"("expiresAt");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_subscriptionId_idx" ON "SubscriptionEvent"("subscriptionId");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_eventType_idx" ON "SubscriptionEvent"("eventType");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_storeEventId_idx" ON "SubscriptionEvent"("storeEventId");

-- CreateIndex
CREATE INDEX "ChatRoom_userOneId_idx" ON "ChatRoom"("userOneId");

-- CreateIndex
CREATE INDEX "ChatRoom_userTwoId_idx" ON "ChatRoom"("userTwoId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRoom_userOneId_userTwoId_key" ON "ChatRoom"("userOneId", "userTwoId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_userId_category_idx" ON "Notification"("userId", "category");

-- CreateIndex
CREATE INDEX "DsarExport_userId_requestedAt_idx" ON "DsarExport"("userId", "requestedAt" DESC);

-- CreateIndex
CREATE INDEX "DsarExport_status_idx" ON "DsarExport"("status");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthCredential" ADD CONSTRAINT "AuthCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthCredential" ADD CONSTRAINT "AuthCredential_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Identity" ADD CONSTRAINT "Identity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_targetIdentityId_fkey" FOREIGN KEY ("targetIdentityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_userOneId_fkey" FOREIGN KEY ("userOneId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_userTwoId_fkey" FOREIGN KEY ("userTwoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_likeOneId_fkey" FOREIGN KEY ("likeOneId") REFERENCES "Like"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_likeTwoId_fkey" FOREIGN KEY ("likeTwoId") REFERENCES "Like"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockerUserId_fkey" FOREIGN KEY ("blockerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentLedger" ADD CONSTRAINT "ConsentLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlanPrice" ADD CONSTRAINT "SubscriptionPlanPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlanPriceHistory" ADD CONSTRAINT "SubscriptionPlanPriceHistory_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "SubscriptionPlanPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlanPriceHistory" ADD CONSTRAINT "SubscriptionPlanPriceHistory_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "UserSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsarExport" ADD CONSTRAINT "DsarExport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
