import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentOrderStatus } from '@prisma/client';
import { Expose } from 'class-transformer';

/**
 * Response shape for `GET /payments/orders/:orderId`.
 *
 * The frontend polls this endpoint after checkout closes and proceeds
 * only when `status === "PAID"`. The browser's own callback is never
 * treated as proof of payment.
 */
export class OrderStatusResponseDto {
  @ApiProperty({
    description: 'Current order lifecycle status.',
    enum: PaymentOrderStatus,
    enumName: 'PaymentOrderStatus',
    example: PaymentOrderStatus.PAID,
  })
  @Expose()
  status: PaymentOrderStatus;

  @ApiPropertyOptional({
    description:
      'Credits granted to the user on a successful payment. Null if payment has not completed.',
    example: 10,
    nullable: true,
  })
  @Expose()
  creditsGranted: number | null;
}

/**
 * Response shape for `POST /payments/orders/:orderId/verify`.
 * Mirrors `OrderStatusResponseDto` — same polling shape.
 */
export class VerifyOrderResponseDto {
  @ApiProperty({
    description: 'Confirmed payment status after server-side signature check.',
    enum: PaymentOrderStatus,
    enumName: 'PaymentOrderStatus',
    example: PaymentOrderStatus.PAID,
  })
  @Expose()
  status: PaymentOrderStatus;

  @ApiPropertyOptional({
    description: 'Credits granted as a result of this payment.',
    example: 10,
    nullable: true,
  })
  @Expose()
  creditsGranted: number | null;
}
