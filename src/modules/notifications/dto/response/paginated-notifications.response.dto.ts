import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { NotificationResponseDto } from './notification.response.dto';

/**
 * Cursor-paginated envelope for notification inbox feeds.
 */
export class PaginatedNotificationsResponseDto {
  @ApiProperty({
    description: 'List of notifications for the current page',
    type: [NotificationResponseDto],
  })
  @Expose()
  @Type(() => NotificationResponseDto)
  items: NotificationResponseDto[];

  @ApiPropertyOptional({
    description:
      'ULID cursor to pass to next query for fetching the subsequent page',
    example: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  })
  @Expose()
  nextCursor?: string | null;

  @ApiProperty({
    description: 'Indicates whether more notifications exist beyond this page',
    example: true,
  })
  @Expose()
  hasMore: boolean;

  @ApiPropertyOptional({
    description:
      'Total unread notifications count for the authenticated user (returned on initial page load)',
    example: 3,
  })
  @Expose()
  unreadCount?: number;
}
