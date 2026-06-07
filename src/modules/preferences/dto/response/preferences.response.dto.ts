import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class PreferencesResponseDto {
  @ApiProperty({ description: 'Push notifications enabled' })
  @Expose()
  pushEnabled: boolean;

  @ApiProperty({ description: 'WhatsApp notifications enabled' })
  @Expose()
  whatsappEnabled: boolean;

  @ApiProperty({ description: 'SMS notifications enabled' })
  @Expose()
  smsEnabled: boolean;

  @ApiProperty({ description: 'Email notifications enabled' })
  @Expose()
  emailEnabled: boolean;
}
