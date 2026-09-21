import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentGateway,
  TransactionChannel,
  TransactionEnvironment,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Min,
} from 'class-validator';

/**
 * Payload for recording an inbound gateway transaction. Consumed service-to-service
 * (currently by the RevenueCat webhook handler) rather than bound to an HTTP body,
 * but validated the same way so it can be exposed later without rework.
 *
 * `gateway` + `gatewayTransactionId` are unique together; a redelivered webhook
 * carrying the same pair is rejected by the database rather than double-recorded.
 */
export class RecordTransactionRequestDto {
  /** Omitted when the gateway's user handle could not be resolved to a local account. */
  @ApiPropertyOptional({
    description: 'ULID of the user this transaction belongs to',
  })
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiProperty({ enum: PaymentGateway, description: 'Originating gateway' })
  @IsEnum(PaymentGateway)
  gateway: PaymentGateway;

  @ApiProperty({
    description: "The gateway's own transaction identifier",
  })
  @IsString()
  gatewayTransactionId: string;

  @ApiPropertyOptional({
    description: "The gateway's event identifier (diagnostics only)",
  })
  @IsString()
  @IsOptional()
  gatewayEventId?: string;

  @ApiPropertyOptional({
    description: 'The user handle exactly as the gateway sent it',
  })
  @IsString()
  @IsOptional()
  gatewayUserId?: string;

  @ApiPropertyOptional({
    enum: TransactionType,
    default: TransactionType.PURCHASE,
  })
  @IsEnum(TransactionType)
  @IsOptional()
  type?: TransactionType;

  @ApiPropertyOptional({
    enum: TransactionStatus,
    default: TransactionStatus.COMPLETED,
  })
  @IsEnum(TransactionStatus)
  @IsOptional()
  status?: TransactionStatus;

  @ApiProperty({
    enum: TransactionEnvironment,
    description:
      'Whether the gateway reported this as a live or sandbox purchase',
  })
  @IsEnum(TransactionEnvironment)
  environment: TransactionEnvironment;

  @ApiPropertyOptional({
    enum: TransactionChannel,
    description: 'Originating client channel (IOS, ANDROID, WEB)',
  })
  @IsEnum(TransactionChannel)
  @IsOptional()
  channel?: TransactionChannel;

  @ApiProperty({ description: 'Store product identifier (e.g. "likes_10")' })
  @IsString()
  productId: string;

  /** Frozen at grant time so a later mapping change never rewrites history. */
  @ApiPropertyOptional({ description: 'Credits granted for this transaction' })
  @IsInt()
  @Min(0)
  @IsOptional()
  creditsGranted?: number;

  @ApiPropertyOptional({
    description: 'Amount paid, in the purchased currency',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @IsOptional()
  amount?: number;

  /** Plain ISO-4217, uppercased — stores report far more currencies than CurrencyCode covers. */
  @ApiPropertyOptional({ description: 'ISO-4217 currency code (e.g. "INR")' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsString()
  @Length(3, 3)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ description: 'ISO-3166 alpha-2 country code' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsString()
  @Length(2, 2)
  @IsOptional()
  countryCode?: string;

  @ApiProperty({
    description: 'When the purchase happened at the gateway (ISO 8601)',
  })
  @IsISO8601()
  occurredAt: string;

  /** Persisted with PII stripped — see `TransactionsService.sanitizePayload`. */
  @ApiPropertyOptional({ description: 'Raw gateway payload for diagnostics' })
  @IsObject()
  @IsOptional()
  rawPayload?: Record<string, unknown>;
}
