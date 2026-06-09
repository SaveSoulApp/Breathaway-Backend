import { ApiProperty } from '@nestjs/swagger';
import { CurrencyCode } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsPositive,
  IsString,
  Length,
} from 'class-validator';

export class CreatePlanPriceRequestDto {
  @ApiProperty({
    enum: CurrencyCode,
    description: 'Currency code for the price',
  })
  @IsEnum(CurrencyCode)
  currencyCode: CurrencyCode;

  @ApiProperty({
    description: 'Price amount (up to 2 decimal places)',
    example: 9.99,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;

  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 country code',
    example: 'IN',
    minLength: 2,
    maxLength: 2,
  })
  @IsString()
  @Length(2, 2)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  countryCode: string;
}
