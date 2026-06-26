import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Response payload representing the current status of a user's notification preferences.
 *
 * Returned by GET /preferences and PATCH /preferences. By default, all communication
 * channels are enabled (true) if preferences have not been customized yet.
 */
export class PreferencesResponseDto {
  /** Indicates if push notifications are enabled on the user's registered devices. */
  @ApiProperty({ description: 'Push notifications enabled' })
  @Expose()
  pushEnabled: boolean;

  /** Indicates if notification alerts are sent via WhatsApp. */
  @ApiProperty({ description: 'WhatsApp notifications enabled' })
  @Expose()
  whatsappEnabled: boolean;

  /** Indicates if text message (SMS) notifications are enabled. */
  @ApiProperty({ description: 'SMS notifications enabled' })
  @Expose()
  smsEnabled: boolean;

  /** Indicates if email alerts are delivered to the user's primary email address. */
  @ApiProperty({ description: 'Email notifications enabled' })
  @Expose()
  emailEnabled: boolean;
}
