import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * The `event` object inside a RevenueCat webhook delivery.
 *
 * Only the fields this system reads are declared. RevenueCat adds fields over
 * time — the `discount_*` trio appeared in real purchase payloads but not in the
 * dashboard's test event — so the route deliberately validates with
 * `forbidNonWhitelisted: false`. Rejecting an unknown field would return a 400,
 * and RevenueCat would retry into the same wall until the event expired.
 */
export class RevenueCatEventDto {
  @ApiProperty({
    description: 'RevenueCat event type (e.g. NON_RENEWING_PURCHASE)',
  })
  @IsString()
  type: string;

  @ApiProperty({ description: "RevenueCat's event identifier" })
  @IsString()
  id: string;

  @ApiPropertyOptional({ description: 'Store transaction identifier' })
  @IsString()
  @IsOptional()
  transaction_id?: string | null;

  @ApiPropertyOptional({ description: 'Original store transaction identifier' })
  @IsString()
  @IsOptional()
  original_transaction_id?: string | null;

  @ApiPropertyOptional({
    description: 'The app user ID the SDK was logged in as',
  })
  @IsString()
  @IsOptional()
  app_user_id?: string | null;

  @ApiPropertyOptional({
    description: 'The originally-seen app user ID; often an anonymous ID',
  })
  @IsString()
  @IsOptional()
  original_app_user_id?: string | null;

  @ApiPropertyOptional({
    description:
      'Every identifier aliased to this customer; order is not stable',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  aliases?: string[] | null;

  @ApiPropertyOptional({ description: 'Store product identifier' })
  @IsString()
  @IsOptional()
  product_id?: string | null;

  @ApiPropertyOptional({ description: 'SANDBOX or PRODUCTION' })
  @IsString()
  @IsOptional()
  environment?: string | null;

  @ApiPropertyOptional({
    description: 'Originating store (e.g. TEST_STORE, PLAY_STORE)',
  })
  @IsString()
  @IsOptional()
  store?: string | null;

  @ApiPropertyOptional({ description: 'Price paid in the purchased currency' })
  @IsNumber()
  @IsOptional()
  price?: number | null;

  @ApiPropertyOptional({ description: 'ISO-4217 currency code' })
  @IsString()
  @IsOptional()
  currency?: string | null;

  @ApiPropertyOptional({ description: 'ISO-3166 alpha-2 country code' })
  @IsString()
  @IsOptional()
  country_code?: string | null;

  @ApiPropertyOptional({ description: 'Purchase time, epoch milliseconds' })
  @IsNumber()
  @IsOptional()
  purchased_at_ms?: number | null;

  @ApiPropertyOptional({ description: 'Event time, epoch milliseconds' })
  @IsNumber()
  @IsOptional()
  event_timestamp_ms?: number | null;
}

/**
 * A RevenueCat webhook delivery. The event is wrapped in an envelope alongside
 * the payload version.
 */
export class RevenueCatWebhookRequestDto {
  @ApiProperty({ type: RevenueCatEventDto })
  @IsObject()
  @ValidateNested()
  @Type(() => RevenueCatEventDto)
  event: RevenueCatEventDto;

  @ApiPropertyOptional({
    description: 'RevenueCat payload version (e.g. "1.0")',
  })
  @IsString()
  @IsOptional()
  api_version?: string;
}
