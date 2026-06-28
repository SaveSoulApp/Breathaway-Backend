import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class GooglePubSubMessage {
  @ApiProperty({
    description: 'Base64-encoded RTDN payload from Google Play',
  })
  @IsString()
  data: string;

  @ApiProperty({ description: 'Unique Pub/Sub message identifier' })
  @IsString()
  messageId: string;

  @ApiPropertyOptional({
    description: 'Timestamp when the message was published',
  })
  @IsDateString()
  @IsOptional()
  publishTime?: string;
}

export class GoogleNotificationRequestDto {
  @ApiProperty({
    description: 'The Pub/Sub message containing the RTDN payload',
    type: () => GooglePubSubMessage,
  })
  @ValidateNested()
  @Type(() => GooglePubSubMessage)
  message: GooglePubSubMessage;

  @ApiProperty({ description: 'Pub/Sub subscription name' })
  @IsString()
  subscription: string;
}
