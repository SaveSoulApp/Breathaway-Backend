import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

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

  @ApiPropertyOptional({
    description:
      'Optional contact phone number in E.164 format (e.g. +919876543210). ' +
      "If omitted, automatically resolved from the authenticated user's verified phone identity.",
    example: '+919876543210',
  })
  @IsOptional()
  @IsString()
  contact?: string;
}
