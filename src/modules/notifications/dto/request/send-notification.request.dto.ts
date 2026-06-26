import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ArrayNotEmpty,
} from 'class-validator';
import { NotificationCategory } from '../../enums/notification-category.enum';
import { NotificationChannel } from '../../enums/notification-channel.enum';
import { NotificationPriority } from '../../enums/notification-priority.enum';
import { NotificationType } from '../../enums/notification-type.enum';

export class SendNotificationRequestDto {
  @ApiPropertyOptional({
    description: 'Channels to send the notification through',
    enum: NotificationChannel,
    isArray: true,
    default: [NotificationChannel.PUSH],
  })
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  @IsOptional()
  channels?: NotificationChannel[] = [NotificationChannel.PUSH];

  @ApiProperty({
    description: 'List of user IDs to send the notification to',
    type: [String],
    example: ['user-1', 'user-2'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  userIds: string[];

  @ApiPropertyOptional({
    description:
      'Title of the notification (optional if using standard template)',
    example: 'New Message',
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description:
      'Body/content of the notification (optional if using standard template)',
    example: 'You have a new message from John',
  })
  @IsString()
  @IsOptional()
  body?: string;

  @ApiProperty({
    description: 'Type of the notification',
    enum: NotificationType,
  })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({
    description: 'Category of the notification',
    enum: NotificationCategory,
  })
  @IsEnum(NotificationCategory)
  category: NotificationCategory;

  @ApiPropertyOptional({
    description: 'Priority of the notification',
    enum: NotificationPriority,
    default: NotificationPriority.NORMAL,
  })
  @IsEnum(NotificationPriority)
  @IsOptional()
  priority?: NotificationPriority = NotificationPriority.NORMAL;

  @ApiPropertyOptional({
    description: 'Unique identifier for the notification',
  })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiPropertyOptional({
    description: 'Additional payload data',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Badge count to display on the app icon',
    type: Number,
  })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  badge?: number;

  @ApiPropertyOptional({
    description: 'Sound to play when notification is received',
    default: 'default',
  })
  @IsString()
  @IsOptional()
  sound?: string = 'default';
}
