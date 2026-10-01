import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { NotificationCategory } from '../../enums/notification-category.enum';

/**
 * Query parameters for fetching a user's notification inbox feed.
 */
export class GetNotificationsRequestDto {
  @ApiPropertyOptional({
    description: 'Number of notifications to return (1-100)',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'ULID cursor of the last notification from the previous page',
    example: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Filter notifications by category',
    enum: NotificationCategory,
  })
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiPropertyOptional({
    description: 'Filter to only return unread notifications',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean = false;
}
