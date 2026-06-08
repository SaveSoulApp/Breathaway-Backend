import {
  IsEnum,
  IsIP,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export enum AuditActionType {
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USAGE_TRIGGERED = 'USAGE_TRIGGERED',
  PURCHASE_TRIGGERED = 'PURCHASE_TRIGGERED',
  IDENTITY_VERIFIED = 'IDENTITY_VERIFIED',
  IDENTITY_OTP_SENT = 'IDENTITY_OTP_SENT',
  PROFILE_UPDATED = 'PROFILE_UPDATED',
}

export class AuditEventDto {
  @IsEnum(AuditActionType)
  @IsNotEmpty()
  actionType: AuditActionType;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsOptional()
  resourceId?: string;

  @IsIP()
  @IsOptional()
  ipAddress?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
