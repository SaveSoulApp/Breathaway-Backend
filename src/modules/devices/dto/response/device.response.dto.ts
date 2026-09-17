import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DevicePlatform } from '@prisma/client';
import { Expose } from 'class-transformer';

/**
 * Response representation of a registered user device.
 *
 * Returned by device management endpoints to represent the registered state,
 * ownership, and diagnostic metadata of a user's notification device.
 */
export class DeviceResponseDto {
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

  /** Operating system platform the device runs (IOS or ANDROID). */
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

  /** Timestamp when the device was first registered. */
  @ApiProperty({ description: 'Creation timestamp' })
  @Expose()
  createdAt: Date;

  /** Timestamp when the device record was last updated. */
  @ApiProperty({ description: 'Last update timestamp' })
  @Expose()
  updatedAt: Date;
}
