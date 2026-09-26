import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentGateway,
  TransactionChannel,
  TransactionEnvironment,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { Expose, Type } from 'class-transformer';

import { BaseAuditExcludeDto } from '@common/dto';

/**
 * A single gateway transaction as returned by the admin listing endpoints.
 *
 * `rawPayload` is deliberately excluded — it is diagnostic-only and, even after
 * sanitisation, is not something the listing needs to hand back.
 */
export class TransactionResponseDto extends BaseAuditExcludeDto {
  @ApiProperty({ description: 'ULID of the transaction' })
  @Expose()
  id: string;

  @ApiPropertyOptional({
    description: 'ULID of the owning user; null when unresolved',
    nullable: true,
  })
  @Expose()
  userId: string | null;

  @ApiProperty({ enum: PaymentGateway })
  @Expose()
  gateway: PaymentGateway;

  @ApiProperty({ description: "The gateway's own transaction identifier" })
  @Expose()
  gatewayTransactionId: string;

  @ApiPropertyOptional({
    description: "The gateway's event identifier",
    nullable: true,
  })
  @Expose()
  gatewayEventId: string | null;

  @ApiPropertyOptional({
    description: 'The user handle as sent by the gateway',
    nullable: true,
  })
  @Expose()
  gatewayUserId: string | null;

  @ApiProperty({ enum: TransactionType })
  @Expose()
  type: TransactionType;

  @ApiProperty({ enum: TransactionStatus })
  @Expose()
  status: TransactionStatus;

  @ApiProperty({ enum: TransactionEnvironment })
  @Expose()
  environment: TransactionEnvironment;

  @ApiPropertyOptional({
    enum: TransactionChannel,
    description: 'Originating client channel (IOS, ANDROID, WEB)',
    nullable: true,
  })
  @Expose()
  channel: TransactionChannel | null;

  @ApiProperty({ description: 'Store product identifier' })
  @Expose()
  productId: string;

  @ApiPropertyOptional({ description: 'Credits granted', nullable: true })
  @Expose()
  creditsGranted: number | null;

  @ApiPropertyOptional({ description: 'Amount paid', nullable: true })
  @Expose()
  @Type(() => Number)
  amount: number | null;

  @ApiPropertyOptional({
    description: 'ISO-4217 currency code',
    nullable: true,
  })
  @Expose()
  currency: string | null;

  @ApiPropertyOptional({
    description: 'ISO-3166 alpha-2 country code',
    nullable: true,
  })
  @Expose()
  countryCode: string | null;

  @ApiProperty({ description: 'When the purchase happened at the gateway' })
  @Expose()
  occurredAt: Date;
}
