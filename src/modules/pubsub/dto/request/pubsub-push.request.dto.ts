import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PubSubMessageDto {
  @ApiPropertyOptional({
    description: 'Base64-encoded message data',
  })
  @IsString()
  @IsOptional()
  data?: string; // Sometimes data is omitted if empty

  @ApiProperty({
    description: 'Unique message identifier',
  })
  @IsString()
  @IsNotEmpty()
  messageId: string;

  @ApiPropertyOptional({
    description: 'Unique message identifier (alternate key)',
  })
  @IsString()
  @IsOptional()
  message_id?: string;

  @ApiPropertyOptional({
    description: 'Timestamp when the message was published',
  })
  @IsString()
  @IsOptional()
  publishTime?: string;

  @ApiPropertyOptional({
    description: 'Timestamp when the message was published (alternate key)',
  })
  @IsString()
  @IsOptional()
  publish_time?: string;

  @ApiPropertyOptional({
    description: 'Attributes associated with the message',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsObject()
  @IsOptional()
  attributes?: Record<string, string>;
}

export class PubSubPushRequestDto {
  @ApiProperty({
    description: 'The Pub/Sub message',
    type: () => PubSubMessageDto,
  })
  @ValidateNested()
  @Type(() => PubSubMessageDto)
  @IsNotEmpty()
  message: PubSubMessageDto;

  @ApiPropertyOptional({
    description: 'Subscription identifier',
  })
  @IsString()
  @IsOptional()
  subscription?: string;

  @ApiPropertyOptional({
    description: 'Current delivery attempt count',
  })
  @IsNumber()
  @IsOptional()
  deliveryAttempt?: number;
}
