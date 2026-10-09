import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { AllowNonWhitelisted } from '@common/decorators';

/**
 * Order details in Cashfree webhook payload.
 */
@AllowNonWhitelisted()
export class CashfreeWebhookOrderDto {
  @ApiPropertyOptional({
    description:
      'Our internal order identifier (receipt) passed during creation.',
  })
  @IsString()
  @IsOptional()
  order_id?: string;

  @ApiPropertyOptional({
    description: 'Order amount in decimal currency unit.',
  })
  @IsNumber()
  @IsOptional()
  order_amount?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  order_currency?: string;
}

/**
 * Payment details in Cashfree webhook payload.
 */
@AllowNonWhitelisted()
export class CashfreeWebhookPaymentDto {
  @ApiPropertyOptional({ description: 'Cashfree gateway payment identifier.' })
  @Transform(({ value }: { value: unknown }): string | undefined =>
    typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : undefined,
  )
  @IsString()
  @IsOptional()
  cf_payment_id?: string;

  @ApiPropertyOptional({
    description: 'Payment status, e.g. "SUCCESS", "FAILED", "USER_DROPPED".',
  })
  @IsString()
  @IsOptional()
  payment_status?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  payment_amount?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  payment_currency?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  payment_message?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  payment_time?: string;
}

/**
 * Data payload in Cashfree webhook event.
 */
@AllowNonWhitelisted()
export class CashfreeWebhookDataDto {
  @ApiPropertyOptional({ type: () => CashfreeWebhookOrderDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CashfreeWebhookOrderDto)
  order?: CashfreeWebhookOrderDto;

  @ApiPropertyOptional({ type: () => CashfreeWebhookPaymentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CashfreeWebhookPaymentDto)
  payment?: CashfreeWebhookPaymentDto;
}

/**
 * Top-level Cashfree webhook request body.
 *
 * Annotated with `@AllowNonWhitelisted()` because Cashfree payload evolves —
 * new fields must not cause 400 rejection.
 */
@AllowNonWhitelisted()
export class CashfreeWebhookRequestDto {
  @ApiPropertyOptional({ type: () => CashfreeWebhookDataDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CashfreeWebhookDataDto)
  data?: CashfreeWebhookDataDto;

  @ApiPropertyOptional({
    description:
      'Event type in Cashfree PG v2, e.g. "PAYMENT_SUCCESS_WEBHOOK", "ORDER_PAID".',
  })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    description:
      'Event type alias sent by some Cashfree products or older versions.',
  })
  @IsString()
  @IsOptional()
  event_type?: string;

  @ApiPropertyOptional({ description: 'Timestamp of the event.' })
  @IsString()
  @IsOptional()
  event_time?: string;
}
