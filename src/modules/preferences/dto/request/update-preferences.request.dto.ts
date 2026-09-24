import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

function parseBoolean(value: unknown): unknown {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}

/**
 * Request payload for updating a user's notification preferences.
 *
 * Submitted via PATCH /preferences to selectively enable or disable communication channels.
 * All fields are optional, allowing partial updates where unspecified settings remain unchanged.
 */
export class UpdatePreferencesRequestDto {
  /** Toggle to enable or disable push notifications on registered user devices. */
  @ApiPropertyOptional({ description: 'Enable push notifications' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => parseBoolean(value))
  pushEnabled?: boolean;

  /** Toggle to enable or disable notification alerts sent via WhatsApp. */
  @ApiPropertyOptional({ description: 'Enable WhatsApp notifications' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => parseBoolean(value))
  whatsappEnabled?: boolean;

  /** Toggle to enable or disable text message (SMS) notifications. */
  @ApiPropertyOptional({ description: 'Enable SMS notifications' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => parseBoolean(value))
  smsEnabled?: boolean;

  /** Toggle to enable or disable email notifications sent to the user's primary email address. */
  @ApiPropertyOptional({ description: 'Enable email notifications' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => parseBoolean(value))
  emailEnabled?: boolean;
}
