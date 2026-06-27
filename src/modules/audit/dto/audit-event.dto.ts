import {
  IsEnum,
  IsIP,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Canonical set of auditable domain events across the BreathAway platform.
 * Each value maps to a distinct user- or system-initiated action that must
 * be recorded for compliance, abuse detection, or operational observability.
 */
export enum AuditActionType {
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_REGISTERED = 'USER_REGISTERED',
  USAGE_TRIGGERED = 'USAGE_TRIGGERED',
  USAGE_DENIED = 'USAGE_DENIED',
  PURCHASE_TRIGGERED = 'PURCHASE_TRIGGERED',
  IDENTITY_VERIFIED = 'IDENTITY_VERIFIED',
  IDENTITY_OTP_SENT = 'IDENTITY_OTP_SENT',
  PROFILE_CREATED = 'PROFILE_CREATED',
  PROFILE_UPDATED = 'PROFILE_UPDATED',
  LIKE_CREATED = 'LIKE_CREATED',
  LIKE_DELETED = 'LIKE_DELETED',
  IDENTITY_CREATED = 'IDENTITY_CREATED',
  BLOCK_CREATED = 'BLOCK_CREATED',
  BLOCK_DELETED = 'BLOCK_DELETED',
  DEVICE_REGISTERED = 'DEVICE_REGISTERED',
  DEVICE_DELETED = 'DEVICE_DELETED',
  OTP_VERIFIED = 'OTP_VERIFIED',
  MATCH_RESOLVED = 'MATCH_RESOLVED',
  MATCH_UNMATCHED = 'MATCH_UNMATCHED',
  SOCIAL_IDENTITY_VERIFIED = 'SOCIAL_IDENTITY_VERIFIED',
  CREDITS_GRANTED = 'CREDITS_GRANTED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
  ADMIN_ACCOUNT_DELETED = 'ADMIN_ACCOUNT_DELETED',
  PREFERENCES_UPDATED = 'PREFERENCES_UPDATED',
  SUBSCRIPTION_CREATED = 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_RENEWED = 'SUBSCRIPTION_RENEWED',
  SUBSCRIPTION_CANCELLED = 'SUBSCRIPTION_CANCELLED',
  SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
  SUBSCRIPTION_REVOKED = 'SUBSCRIPTION_REVOKED',
  SUBSCRIPTION_PLAN_CREATED = 'SUBSCRIPTION_PLAN_CREATED',
  SUBSCRIPTION_PLAN_UPDATED = 'SUBSCRIPTION_PLAN_UPDATED',
}

/**
 * Payload emitted with every `audit.log` event and published verbatim to the
 * audit Pub/Sub topic.
 *
 * Emitters should populate `resourceId` and `metadata` with enough context for
 * a downstream consumer to reconstruct what changed and why, without querying
 * the primary database.
 */
export class AuditEventDto {
  /** The category of action being recorded; used as a Pub/Sub message attribute for filtering. */
  @IsEnum(AuditActionType)
  @IsNotEmpty()
  actionType: AuditActionType;

  /** Internal BreathAway user ID of the actor who triggered the event. */
  @IsString()
  @IsNotEmpty()
  userId: string;

  /** ID of the primary resource affected by the action (e.g., likeId, matchId, identityId). */
  @IsString()
  @IsOptional()
  resourceId?: string;

  /** IPv4 or IPv6 address of the originating request, used for abuse and geo-anomaly detection. */
  @IsIP()
  @IsOptional()
  ipAddress?: string;

  /** Arbitrary key-value pairs providing additional event context (e.g., previous values, diff). */
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
