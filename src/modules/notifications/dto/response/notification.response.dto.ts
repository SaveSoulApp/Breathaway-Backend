import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { NotificationCategory } from '../../enums/notification-category.enum';
import { NotificationPriority } from '../../enums/notification-priority.enum';
import { NotificationType } from '../../enums/notification-type.enum';

/**
 * Standardized in-app notification representation for client display and routing.
 */
export class NotificationResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the notification',
    example: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  })
  @Expose()
  id: string;

  @ApiProperty({
    description: 'Recipient user ID',
    example: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  })
  @Expose()
  userId: string;

  @ApiProperty({
    description: 'Domain event type that generated this notification',
    enum: NotificationType,
  })
  @Expose()
  type: NotificationType;

  @ApiProperty({
    description: 'High-level category for inbox filtering',
    enum: NotificationCategory,
  })
  @Expose()
  category: NotificationCategory;

  @ApiProperty({
    description: 'Priority level of the notification',
    enum: NotificationPriority,
  })
  @Expose()
  priority: NotificationPriority;

  @ApiProperty({
    description: 'Title of the notification',
    example: 'New Match!',
  })
  @Expose()
  title: string;

  @ApiProperty({
    description: 'Body text of the notification',
    example: 'You have a new match with Sarah',
  })
  @Expose()
  body: string;

  @ApiPropertyOptional({
    description: 'Action indicator for client navigation semantics',
    example: 'NAVIGATE',
  })
  @Expose()
  action?: string | null;

  @ApiPropertyOptional({
    description: 'Deep link route or URL for client navigation',
    example: '/matches/mat_123',
  })
  @Expose()
  link?: string | null;

  @ApiPropertyOptional({
    description: 'Polymorphic JSON metadata payload for client UI hydration',
  })
  @Expose()
  data?: Record<string, unknown> | null;

  @ApiProperty({
    description: 'Whether the notification has been marked as read',
    example: false,
  })
  @Expose()
  isRead: boolean;

  @ApiPropertyOptional({
    description: 'Timestamp when the notification was marked as read',
  })
  @Expose()
  readAt?: Date | null;

  @ApiProperty({
    description: 'Creation timestamp',
  })
  @Expose()
  createdAt: Date;
}
