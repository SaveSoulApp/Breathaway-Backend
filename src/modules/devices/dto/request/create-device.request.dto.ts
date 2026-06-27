import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { Platform } from '@common/interfaces';

/**
 * Payload for registering a new user device.
 *
 * Submitted to POST /devices to register or associate a push notification token
 * with the authenticated user to enable targeted push message delivery.
 */
export class CreateDeviceDto {
  /**
   * Unique push notification token issued by FCM or APNs.
   * Must be a non-empty string and cannot exceed 255 characters.
   */
  @ApiProperty({
    description: 'Push notification token',
    example: 'fcm-token-or-apns-token',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token: string;

  /**
   * The device operating system platform.
   * If omitted or unrecognized, defaults to ANDROID in the database mapping layer.
   */
  @ApiProperty({
    description: 'Device platform',
    enum: Platform,
    example: Platform.ANDROID,
  })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  /**
   * Unique physical device identifier (e.g., Apple Vendor ID, Android ID, or custom UUID).
   * Used to associate a persistent physical device across token changes. Must not exceed 255 characters.
   */
  @ApiPropertyOptional({
    description: 'Unique device identifier (e.g., vendor ID)',
    example: 'device-123',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;

  /**
   * The client application version installed on the device (e.g., '1.2.3').
   * Used for diagnostics and version-targeted notification delivery. Must not exceed 50 characters.
   */
  @ApiPropertyOptional({
    description: 'Application version',
    example: '1.2.3',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;

  /**
   * Flag indicating whether the device is active and eligible to receive push notifications.
   * Defaults to true if not specified.
   */
  @ApiPropertyOptional({
    description: 'Whether the device is active',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
