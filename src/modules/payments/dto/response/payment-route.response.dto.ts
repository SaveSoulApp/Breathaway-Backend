import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentGateway } from '@prisma/client';
import { Expose } from 'class-transformer';

/**
 * Response shape for a payment gateway route.
 */
export class PaymentRouteResponseDto {
  @ApiProperty({
    description: 'Internal ULID of the payment gateway route.',
    example: '01J8VXYZ1234ABCDEFGHJKMNPQ',
  })
  @Expose()
  id: string;

  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 country code.',
    example: 'IN',
  })
  @Expose()
  countryCode: string;

  @ApiProperty({
    description: 'Payment gateway provider identifier.',
    enum: PaymentGateway,
    enumName: 'PaymentGateway',
    example: PaymentGateway.RAZORPAY,
  })
  @Expose()
  gateway: PaymentGateway;

  @ApiProperty({
    description:
      'Ordinal priority step number (1 = primary). Evaluated in ascending order.',
    example: 1,
  })
  @Expose()
  priority: number;

  @ApiProperty({
    description: 'Whether the route is enabled for payment selection.',
    example: true,
  })
  @Expose()
  enabled: boolean;

  @ApiPropertyOptional({
    description:
      'Minimum transaction amount guard in smallest currency unit (e.g. paise). Null means no limit.',
    example: 100,
    nullable: true,
  })
  @Expose()
  minAmount: number | null;

  @ApiPropertyOptional({
    description:
      'Maximum transaction amount guard in smallest currency unit (e.g. paise). Null means no limit.',
    example: 500000,
    nullable: true,
  })
  @Expose()
  maxAmount: number | null;

  @ApiProperty({
    description: 'Timestamp when this route was created.',
    example: '2026-09-27T00:00:00.000Z',
  })
  @Expose()
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when this route was last updated.',
    example: '2026-09-27T00:00:00.000Z',
  })
  @Expose()
  updatedAt: Date;
}
