import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Request DTO for initiating a GDPR / CCPA Data Subject Access Request export.
 */
export class RequestDsarExportRequestDto {
  @ApiPropertyOptional({
    description:
      'Optional custom passphrase to encrypt the ZIP archive with AES-256. If omitted, a secure random one-time key is generated.',
    example: 'SecurePassphrase2026!',
    minLength: 8,
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  passphrase?: string;

  @ApiPropertyOptional({
    description:
      'Set to true to force a fresh data export even if within the 24-hour cooldown window (e.g. if the previous passphrase was lost).',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
