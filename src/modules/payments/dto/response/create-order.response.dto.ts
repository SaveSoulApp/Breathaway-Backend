import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentGateway, PaymentOrderStatus } from '@prisma/client';
import { Expose, Type } from 'class-transformer';

/**
 * The checkout action shape — discriminated on `type`.
 * The frontend branches only on this field, keeping provider-specific
 * logic out of shared UI code.
 */
export class PaymentActionDto {
  @ApiProperty({
    description:
      'How to open the payment UI. "sdk" = Razorpay/Cashfree SDK; ' +
      '"redirect" = hosted page; "form_post" = hidden POST form.',
    enum: ['sdk', 'redirect', 'form_post'],
    example: 'sdk',
  })
  @Expose()
  type: 'sdk' | 'redirect' | 'form_post';

  // ── sdk fields ─────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      '[sdk only] Razorpay/Cashfree publishable key — safe to send to the browser.',
    example: 'rzp_test_...',
  })
  @Expose()
  keyId?: string;

  @ApiPropertyOptional({
    description: '[sdk only] Gateway-side order identifier (e.g. order_Nx...).',
    example: 'order_PZzFNjKiHwPLnZ',
  })
  @Expose()
  gatewayOrderId?: string;

  @ApiPropertyOptional({
    description: '[sdk only] Prefill data for the checkout form.',
    example: { contact: '+919876543210', name: 'Gaurav' },
  })
  @Expose()
  prefill?: { contact?: string; name?: string };

  // ── redirect fields ─────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: '[redirect only] URL to redirect the browser to.',
    example: 'https://payment.decentro.tech/pay/xyz',
  })
  @Expose()
  url?: string;

  // ── form_post fields ────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      '[form_post only] Hidden form fields to POST to `url`. Key-value pairs.',
    example: { key: 'merchant_key', txnid: 'tx_123' },
  })
  @Expose()
  fields?: Record<string, string>;
}

/**
 * Response shape for `POST /payments/orders`.
 *
 * The `action` object is the only thing the frontend branches on.
 * All gateway routing, key selection, and amount calculation happen server-side.
 */
export class CreateOrderResponseDto {
  @ApiProperty({
    description: 'Internal PaymentOrder ULID.',
    example: '01J8VXYZ1234ABCDEFGHJKMNPQ',
  })
  @Expose()
  orderId: string;

  @ApiProperty({
    description:
      'Uppercase gateway identifier — used by the frontend to pick the right SDK loader.',
    example: PaymentGateway.RAZORPAY,
    enum: PaymentGateway,
    enumName: 'PaymentGateway',
  })
  @Expose()
  provider: PaymentGateway;

  @ApiProperty({
    description: 'Current order status (always PENDING on creation).',
    example: PaymentOrderStatus.PENDING,
    enum: PaymentOrderStatus,
    enumName: 'PaymentOrderStatus',
  })
  @Expose()
  status: PaymentOrderStatus;

  @ApiProperty({
    description: 'Amount in smallest currency unit (e.g. paise for INR).',
    example: 39900,
  })
  @Expose()
  amount: number;

  @ApiProperty({
    description: 'ISO-4217 currency code.',
    example: 'INR',
  })
  @Expose()
  currency: string;

  @ApiProperty({
    description:
      'Checkout action — the frontend branches only on `action.type`.',
    type: () => PaymentActionDto,
  })
  @Expose()
  @Type(() => PaymentActionDto)
  action: PaymentActionDto;
}
