import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Request payload for updating a user's notification preferences.
 *
 * Submitted via PATCH /preferences to selectively enable or disable communication channels.
 * All fields are optional, allowing partial updates where unspecified settings remain unchanged.
 */
export class UpdatePreferencesRequestDto {
  /** Toggle to enable or disable push notifications on registered user devices. */
  @ApiPropertyOptional({ description: 'Enable push notifications' })
  @IsBoolean()
  @IsOptional()
  pushEnabled?: boolean;

  /** Toggle to enable or disable notification alerts sent via WhatsApp. */
  @ApiPropertyOptional({ description: 'Enable WhatsApp notifications' })
  @IsBoolean()
  @IsOptional()
  whatsappEnabled?: boolean;

  /** Toggle to enable or disable text message (SMS) notifications. */
  @ApiPropertyOptional({ description: 'Enable SMS notifications' })
  @IsBoolean()
  @IsOptional()
  smsEnabled?: boolean;

  /** Toggle to enable or disable email notifications sent to the user's primary email address. */
  @ApiPropertyOptional({ description: 'Enable email notifications' })
  @IsBoolean()
  @IsOptional()
  emailEnabled?: boolean;
}
