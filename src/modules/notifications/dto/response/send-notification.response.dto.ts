import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsString } from 'class-validator';

/**
 * Response payload confirming that a notification dispatch request
 * was accepted and queued for processing.
 */
export class SendNotificationResponseDto {
  @ApiProperty({
    description:
      'Indicates if the notification dispatch was successfully queued',
    example: true,
  })
  @IsBoolean()
  success: boolean;

  @ApiProperty({
    description: 'Summary message describing the dispatch outcome',
    example: 'Notification dispatch requested for 5 users',
  })
  @IsString()
  message: string;

  @ApiProperty({
    description: 'Total number of target recipients enqueued for delivery',
    example: 5,
  })
  @IsInt()
  userCount: number;
}
