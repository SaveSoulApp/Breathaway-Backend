import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PubSubMessageDto {
  @IsString()
  @IsNotEmpty()
  data: string;

  @IsString()
  @IsNotEmpty()
  messageId: string;

  @IsObject()
  @IsOptional()
  attributes?: Record<string, string>;
}

export class PubSubPushRequestDto {
  @ValidateNested()
  @Type(() => PubSubMessageDto)
  @IsNotEmpty()
  message: PubSubMessageDto;
}
