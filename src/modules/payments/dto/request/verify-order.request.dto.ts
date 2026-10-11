import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Request body for `POST /payments/orders/:orderId/verify`.
 *
 * For Razorpay orders, contains the three identifiers returned by the Razorpay checkout SDK.
 * For Cashfree orders, these fields are optional as Cashfree verification is validated
 * against Cashfree servers or incoming webhook events.
 */
export class VerifyOrderRequestDto {
  @ApiPropertyOptional({
    description:
      "Razorpay's payment identifier (returned by Razorpay checkout SDK).",
    example: 'pay_PZzFNjKiHwPLnZ',
  })
  @IsOptional()
  @IsString()
  razorpay_payment_id?: string;

  @ApiPropertyOptional({
    description:
      "Razorpay's order identifier (returned by Razorpay checkout SDK).",
    example: 'order_PZzFNjKiHwPLnZ',
  })
  @IsOptional()
  @IsString()
  razorpay_order_id?: string;

  @ApiPropertyOptional({
    description:
      'HMAC-SHA256 signature over "{razorpay_order_id}|{razorpay_payment_id}", signed with the key secret.',
    example: 'abc123def456...',
  })
  @IsOptional()
  @IsString()
  razorpay_signature?: string;
}
