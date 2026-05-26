import { Type } from 'class-transformer';
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
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  @IsOptional()
  channels?: NotificationChannel[] = [NotificationChannel.PUSH];

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  userIds: string[];

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsEnum(NotificationCategory)
  category: NotificationCategory;

  @IsEnum(NotificationPriority)
  @IsOptional()
  priority?: NotificationPriority = NotificationPriority.NORMAL;

  @IsString()
  @IsOptional()
  id?: string;

  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  badge?: number;

  @IsString()
  @IsOptional()
  sound?: string = 'default';
}
