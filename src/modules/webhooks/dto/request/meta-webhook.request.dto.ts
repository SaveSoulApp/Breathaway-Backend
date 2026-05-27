import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * Represents the message object inside a messaging event.
 *
 * Example:
 * ```json
 * { "mid": "aWdfZAG1fa...", "text": "Hi" }
 * ```
 */
export class MetaMessageDto {
  @ApiProperty({
    description: 'Message ID',
  })
  @IsString()
  mid: string;

  @ApiPropertyOptional({
    description: 'Message text content',
  })
  @IsOptional()
  @IsString()
  text?: string;
}

/**
 * Represents a sender or recipient with an ID.
 */
export class MetaParticipantDto {
  @ApiProperty({
    description: 'Participant ID (Sender or Recipient)',
  })
  @IsString()
  id: string;
}

/**
 * Represents a single messaging event inside an entry.
 *
 * Example:
 * ```json
 * {
 *   "sender": { "id": "123" },
 *   "recipient": { "id": "456" },
 *   "timestamp": 1776449050416,
 *   "message": { "mid": "...", "text": "Hi" }
 * }
 * ```
 */
export class MetaMessagingEventDto {
  @ApiProperty({
    description: 'Sender of the message',
    type: () => MetaParticipantDto,
  })
  @ValidateNested()
  @Type(() => MetaParticipantDto)
  sender: MetaParticipantDto;

  @ApiProperty({
    description: 'Recipient of the message',
    type: () => MetaParticipantDto,
  })
  @ValidateNested()
  @Type(() => MetaParticipantDto)
  recipient: MetaParticipantDto;

  @ApiProperty({
    description: 'Event timestamp',
  })
  @IsNumber()
  timestamp: number;

  @ApiPropertyOptional({
    description: 'Message details (if present)',
    type: () => MetaMessageDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => MetaMessageDto)
  message?: MetaMessageDto;
}

/**
 * Represents an entry in the Meta webhook payload.
 *
 * Each entry corresponds to one page/account and may contain
 * multiple messaging events.
 */
export class MetaWebhookEntryDto {
  @ApiProperty({
    description: 'Page or Account ID',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Time of update',
  })
  @IsNumber()
  time: number;

  @ApiPropertyOptional({
    description: 'Array of messaging events',
    type: [MetaMessagingEventDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetaMessagingEventDto)
  messaging?: MetaMessagingEventDto[];
}

/**
 * Root DTO for all Meta (Instagram) webhook payloads.
 *
 * Example payload:
 * ```json
 * {
 *   "object": "instagram",
 *   "entry": [{ ... }]
 * }
 * ```
 */
export class MetaWebhookDto {
  @ApiProperty({
    description: 'Object type (usually "instagram")',
    example: 'instagram',
  })
  @IsString()
  object: string;

  @ApiProperty({
    description: 'Array of entry objects',
    type: [MetaWebhookEntryDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetaWebhookEntryDto)
  entry: MetaWebhookEntryDto[];
}
