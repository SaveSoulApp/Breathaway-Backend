import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentGateway } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

/**
 * Request body for creating a new payment gateway route.
 */
export class CreatePaymentRouteRequestDto {
  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 country code (e.g., IN, US, GB).',
    example: 'IN',
  })
  @IsString()
  @Length(2, 2)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value,
  )
  countryCode: string;

  @ApiProperty({
    description: 'Payment gateway provider identifier.',
    enum: PaymentGateway,
    enumName: 'PaymentGateway',
    example: PaymentGateway.RAZORPAY,
  })
  @IsEnum(PaymentGateway)
  gateway: PaymentGateway;

  @ApiPropertyOptional({
    description:
      'Ordinal priority step number (1 = primary). Defaults to the next step (N + 1). ' +
      'If specified as step K (1 <= K <= N), existing routes with priority >= K shift down by 1.',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @ApiPropertyOptional({
    description:
      'Whether this route is enabled for checkout routing. Defaults to true.',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Minimum transaction amount in smallest currency unit (e.g. paise for INR). Null means no minimum limit.',
    example: 100,
    minimum: 0,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({
    description:
      'Maximum transaction amount in smallest currency unit (e.g. paise for INR). Null means no maximum limit.',
    example: 500000,
    minimum: 0,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxAmount?: number;
}
