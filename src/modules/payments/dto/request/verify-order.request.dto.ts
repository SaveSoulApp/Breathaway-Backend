import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * Request body for `POST /payments/orders/:orderId/verify`.
 *
 * Contains the three identifiers returned by the Razorpay checkout SDK
 * after the user completes payment. The signature is verified server-side
 * using HMAC-SHA256 — the browser's callback is never treated as proof.
 */
export class VerifyOrderRequestDto {
  @ApiProperty({
    description: "Razorpay's payment identifier (returned by checkout SDK).",
    example: 'pay_PZzFNjKiHwPLnZ',
  })
  @IsString()
  razorpay_payment_id: string;

  @ApiProperty({
    description: "Razorpay's order identifier (returned by checkout SDK).",
    example: 'order_PZzFNjKiHwPLnZ',
  })
  @IsString()
  razorpay_order_id: string;

  @ApiProperty({
    description:
      'HMAC-SHA256 signature over "{razorpay_order_id}|{razorpay_payment_id}", signed with the key secret.',
    example: 'abc123def456...',
  })
  @IsString()
  razorpay_signature: string;
}
