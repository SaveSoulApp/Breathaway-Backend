import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DevicePlatform } from '@prisma/client';
import { Expose } from 'class-transformer';

import { BaseAuditExcludeDto } from '@common/dto';

/**
 * Response representation of a registered user device.
 *
 * Returned by device management endpoints to represent the registered state,
 * ownership, and diagnostic metadata of a user's notification device.
 */
export class DeviceResponseDto extends BaseAuditExcludeDto {
  /** Unique identifier of the device record, represented as a ULID. */
  @ApiProperty({ description: 'Device record ID (ULID)' })
  @Expose()
  id: string;

  /** ID of the user that owns and registered this device. */
  @ApiProperty({ description: 'User ID that owns this device' })
  @Expose()
  userId: string;

  /** Unique push notification registration token issued by FCM or APNs. */
  @ApiProperty({ description: 'Push notification token' })
  @Expose()
  token: string;

  /** Operating system platform the device runs (IOS, ANDROID, or WEB). */
  @ApiProperty({ description: 'Device platform', enum: DevicePlatform })
  @Expose()
  platform: DevicePlatform;

  /** Unique hardware or vendor identifier representing the physical device, if provided. */
  @ApiPropertyOptional({ description: 'Unique device identifier' })
  @Expose()
  deviceId?: string;

  /** Version of the client application installed on the device, if provided. */
  @ApiPropertyOptional({ description: 'Application version' })
  @Expose()
  appVersion?: string;

  /** Indicates if the device is active and eligible to receive push notifications. */
  @ApiProperty({ description: 'Whether the device is active' })
  @Expose()
  isActive: boolean;
}
