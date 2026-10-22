import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { DevicePlatform } from '@prisma/client';

/**
 * Structured device information associated with an active session.
 */
export class SessionDeviceDto {
  @ApiPropertyOptional({
    description: 'Physical or client device identifier',
    example: 'd8c47b51-9f1e-45fa-b64d-773a9856a901',
    nullable: true,
  })
  @Expose()
  deviceId?: string | null;

  @ApiProperty({
    description: 'Operating platform of the device',
    enum: DevicePlatform,
    example: DevicePlatform.IOS,
  })
  @Expose()
  platform: DevicePlatform;

  @ApiPropertyOptional({
    description: 'Marketing or hardware model of the device',
    example: 'iPhone 15 Pro',
    nullable: true,
  })
  @Expose()
  deviceModel?: string | null;

  @ApiPropertyOptional({
    description: 'Operating system name and version',
    example: 'iOS 17.5',
    nullable: true,
  })
  @Expose()
  os?: string | null;

  @ApiPropertyOptional({
    description: 'Browser name and version, if accessed via web',
    example: 'Chrome 124.0',
    nullable: true,
  })
  @Expose()
  browser?: string | null;

  @ApiPropertyOptional({
    description: 'Application build or client version',
    example: '1.0.0',
    nullable: true,
  })
  @Expose()
  appVersion?: string | null;

  @ApiProperty({
    description:
      'Whether active push notification tokens are registered for this device',
    example: true,
  })
  @Expose()
  pushEnabled: boolean;
}
