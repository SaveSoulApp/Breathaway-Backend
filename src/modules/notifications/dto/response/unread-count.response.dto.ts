import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Response payload carrying the unread notification count for badge rendering.
 */
export class UnreadCountResponseDto {
  @ApiProperty({
    description: 'Total number of unread notifications for the user',
    example: 5,
  })
  @Expose()
  unreadCount: number;
}
