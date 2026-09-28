import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentGateway } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

/**
 * Query parameters for filtering the list of payment gateway routes.
 */
export class ListPaymentRoutesQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter routes by ISO 3166-1 alpha-2 country code (e.g. IN, US).',
    example: 'IN',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value,
  )
  countryCode?: string;

  @ApiPropertyOptional({
    description: 'Filter routes by enabled status (true or false).',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Filter routes by gateway provider.',
    enum: PaymentGateway,
    enumName: 'PaymentGateway',
    example: PaymentGateway.RAZORPAY,
  })
  @IsOptional()
  @IsEnum(PaymentGateway)
  gateway?: PaymentGateway;
}
