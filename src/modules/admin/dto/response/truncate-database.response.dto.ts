import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class TruncateDatabaseResponseDto {
  @ApiProperty({ example: true })
  @Expose()
  success: boolean;

  @ApiProperty({ example: 'Database truncated successfully' })
  @Expose()
  message: string;

  @ApiProperty({
    example: [
      'AuthCredential',
      'Block',
      'ChatRoom',
      'ConsentLedger',
      'CreditLedger',
      'Device',
      'DsarExport',
      'Identity',
      'Like',
      'Match',
      'Message',
      'Notification',
      'NotificationPreference',
      'PaymentOrder',
      'SubscriptionEvent',
      'Transaction',
      'User',
      'UserProfile',
      'UserSession',
      'UserSubscription',
    ],
  })
  @Expose()
  truncatedTables: string[];

  @ApiProperty({ example: '2026-10-21T06:36:28.000Z' })
  @Expose()
  timestamp: string;
}
