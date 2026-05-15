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

export class CreateDeviceDto {
  @ApiProperty({
    description: 'Push notification token',
    example: 'fcm-token-or-apns-token',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token: string;

  @ApiProperty({
    description: 'Device platform',
    enum: Platform,
    example: Platform.ANDROID,
  })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiPropertyOptional({
    description: 'Unique device identifier (e.g., vendor ID)',
    example: 'device-123',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;

  @ApiPropertyOptional({
    description: 'Application version',
    example: '1.2.3',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;

  @ApiPropertyOptional({
    description: 'Whether the device is active',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
