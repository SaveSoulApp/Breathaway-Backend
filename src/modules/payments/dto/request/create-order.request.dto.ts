import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * Request body for `POST /payments/orders`.
 *
 * The amount is intentionally absent — it is always derived server-side
 * from the `SubscriptionPlanPrice` for the user's country. The frontend
 * never sets the price.
 */
export class CreateOrderRequestDto {
  @ApiProperty({
    description: 'ULID of the SubscriptionPlan to purchase.',
    example: '01J8VXYZ1234ABCDEFGHJKMNPQ',
  })
  @IsString()
  planId: string;
}
