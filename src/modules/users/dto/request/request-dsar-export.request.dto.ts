import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
}
