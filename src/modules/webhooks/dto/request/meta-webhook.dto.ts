import { Type } from 'class-transformer';
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
  @IsString()
  mid: string;

  @IsOptional()
  @IsString()
  text?: string;
}

/**
 * Represents a sender or recipient with an ID.
 */
export class MetaParticipantDto {
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
  @ValidateNested()
  @Type(() => MetaParticipantDto)
  sender: MetaParticipantDto;

  @ValidateNested()
  @Type(() => MetaParticipantDto)
  recipient: MetaParticipantDto;

  @IsNumber()
  timestamp: number;

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
  @IsString()
  id: string;

  @IsNumber()
  time: number;

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
  @IsString()
  object: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetaWebhookEntryDto)
  entry: MetaWebhookEntryDto[];
}
