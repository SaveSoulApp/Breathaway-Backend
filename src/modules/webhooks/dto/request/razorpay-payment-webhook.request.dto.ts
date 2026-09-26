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
 * Razorpay payment entity nested in the webhook payload.
 */
export class RazorpayPaymentDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  entity: string;

  @ApiProperty()
  @IsNumber()
  amount: number;

  @ApiProperty()
  @IsString()
  currency: string;

  @ApiProperty()
  @IsString()
  status: string;

  @ApiProperty()
  @IsString()
  order_id: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  contact?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  created_at?: number;
}

/**
 * Razorpay order entity nested in the webhook payload.
 */
export class RazorpayOrderDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  entity: string;

  @ApiProperty()
  @IsString()
  receipt: string;

  @ApiProperty()
  @IsString()
  status: string;
}

/**
 * Wrapper for the payment entity in Razorpay webhook payload.
 */
export class RazorpayPaymentEntityWrapperDto {
  @ApiProperty({ type: () => RazorpayPaymentDto })
  @ValidateNested()
  @Type(() => RazorpayPaymentDto)
  entity: RazorpayPaymentDto;
}

/**
 * Wrapper for the order entity in Razorpay webhook payload.
 */
export class RazorpayOrderEntityWrapperDto {
  @ApiProperty({ type: () => RazorpayOrderDto })
  @ValidateNested()
  @Type(() => RazorpayOrderDto)
  entity: RazorpayOrderDto;
}

/**
 * The `payload` object in a Razorpay webhook event.
 */
export class RazorpayWebhookPayloadDto {
  @ApiPropertyOptional({ type: () => RazorpayPaymentEntityWrapperDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RazorpayPaymentEntityWrapperDto)
  payment?: RazorpayPaymentEntityWrapperDto;

  @ApiPropertyOptional({ type: () => RazorpayOrderEntityWrapperDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RazorpayOrderEntityWrapperDto)
  order?: RazorpayOrderEntityWrapperDto;
}

/**
 * Top-level Razorpay webhook request body.
 *
 * Annotated with `@AllowNonWhitelisted()` because Razorpay's schema evolves —
 * new fields must not cause 400 errors.
 *
 * @see https://razorpay.com/docs/webhooks/payloads/payments/
 */
@AllowNonWhitelisted()
export class RazorpayWebhookRequestDto {
  @ApiProperty({ description: 'Event name, e.g. "payment.captured".' })
  @IsString()
  event: string;

  @ApiProperty({ description: 'Always "event".' })
  @IsString()
  entity: string;

  @ApiPropertyOptional({ description: 'Unique event ID for deduplication.' })
  @IsString()
  @IsOptional()
  event_id?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  created_at?: number;

  @ApiProperty({ type: () => RazorpayWebhookPayloadDto })
  @IsObject()
  @ValidateNested()
  @Type(() => RazorpayWebhookPayloadDto)
  payload: RazorpayWebhookPayloadDto;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  account_id?: string;
}
