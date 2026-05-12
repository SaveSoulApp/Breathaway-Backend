import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DevicePlatform } from '@prisma/client';

export class DeviceResponseDto {
  @ApiProperty({ description: 'Device record ID (ULID)' })
  id: string;

  @ApiProperty({ description: 'User ID that owns this device' })
  userId: string;

  @ApiProperty({ description: 'Push notification token' })
  token: string;

  @ApiProperty({ description: 'Device platform', enum: DevicePlatform })
  platform: DevicePlatform;

  @ApiPropertyOptional({ description: 'Unique device identifier' })
  deviceId?: string;

  @ApiPropertyOptional({ description: 'Application version' })
  appVersion?: string;

  @ApiProperty({ description: 'Whether the device is active' })
  isActive: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}