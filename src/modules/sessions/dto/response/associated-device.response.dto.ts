import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { DevicePlatform } from '@prisma/client';

/**
 * Represents a device registered under the user's account in the Device table.
 */
export class AssociatedDeviceResponseDto {
  @ApiProperty({
    description: 'Unique device record identifier (ULID)',
    example: '01M5DEVICE000000000000001',
  })
  @Expose()
  id: string;

  @ApiPropertyOptional({
    description: 'Hardware or client device identifier',
    example: 'd8c47b51-9f1e-45fa-b64d-773a9856a901',
    nullable: true,
  })
  @Expose()
  deviceId?: string | null;

  @ApiProperty({
    description: 'Operating platform of the registered device',
    enum: DevicePlatform,
    example: DevicePlatform.IOS,
  })
  @Expose()
  platform: DevicePlatform;

  @ApiPropertyOptional({
    description: 'Application build or client version',
    example: '1.0.0',
    nullable: true,
  })
  @Expose()
  appVersion?: string | null;

  @ApiProperty({
    description:
      'Whether push notification delivery is enabled for this device token',
    example: true,
  })
  @Expose()
  isActive: boolean;

  @ApiProperty({
    description:
      'Whether this device currently has an active authenticated session',
    example: true,
  })
  @Expose()
  hasActiveSession: boolean;

  @ApiProperty({
    description: 'Timestamp when the device was first registered',
    example: '2026-10-20T10:00:00.000Z',
  })
  @Expose()
  createdAt: string;

  @ApiProperty({
    description: 'Timestamp when the device record was last updated',
    example: '2026-10-22T18:31:32.782Z',
  })
  @Expose()
  updatedAt: string;
}
