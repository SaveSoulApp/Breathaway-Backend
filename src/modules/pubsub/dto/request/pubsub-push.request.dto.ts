import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PubSubMessageDto {
  @IsString()
  @IsOptional()
  data?: string; // Sometimes data is omitted if empty

  @IsString()
  @IsNotEmpty()
  messageId: string;

  @IsString()
  @IsOptional()
  message_id?: string;

  @IsString()
  @IsOptional()
  publishTime?: string;

  @IsString()
  @IsOptional()
  publish_time?: string;

  @IsObject()
  @IsOptional()
  attributes?: Record<string, string>;
}

export class PubSubPushRequestDto {
  @ValidateNested()
  @Type(() => PubSubMessageDto)
  @IsNotEmpty()
  message: PubSubMessageDto;

  @IsString()
  @IsOptional()
  subscription?: string;

  @IsNumber()
  @IsOptional()
  deliveryAttempt?: number;
}
