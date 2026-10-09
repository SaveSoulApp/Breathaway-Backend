import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
export class CashfreeWebhookOrderDto {
  @ApiProperty({
    description:
      'Our internal order identifier (receipt) passed during creation.',
  })
  @IsString()
  order_id: string;

  @ApiProperty({ description: 'Order amount in decimal currency unit.' })
  @IsNumber()
  order_amount: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  order_currency?: string;
}

/**
 * Payment details in Cashfree webhook payload.
 */
export class CashfreeWebhookPaymentDto {
  @ApiProperty({ description: 'Cashfree gateway payment identifier.' })
  @IsString()
  cf_payment_id: string;

  @ApiProperty({
    description: 'Payment status, e.g. "SUCCESS", "FAILED", "USER_DROPPED".',
  })
  @IsString()
  payment_status: string;

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
  payment_time?: string;
}

/**
 * Data payload in Cashfree webhook event.
 */
export class CashfreeWebhookDataDto {
  @ApiProperty({ type: () => CashfreeWebhookOrderDto })
  @ValidateNested()
  @Type(() => CashfreeWebhookOrderDto)
  order: CashfreeWebhookOrderDto;

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
  @ApiProperty({ type: () => CashfreeWebhookDataDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CashfreeWebhookDataDto)
  data: CashfreeWebhookDataDto;

  @ApiProperty({
    description: 'Event type, e.g. "PAYMENT_SUCCESS_WEBHOOK", "ORDER_PAID".',
  })
  @IsString()
  event_type: string;

  @ApiPropertyOptional({ description: 'Timestamp of the event.' })
  @IsString()
  @IsOptional()
  event_time?: string;
}
