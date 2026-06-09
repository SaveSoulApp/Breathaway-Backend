import { ApiProperty } from '@nestjs/swagger';
import { CurrencyCode } from '@prisma/client';
import { Expose } from 'class-transformer';

export class SubscriptionPlanPriceResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ enum: CurrencyCode })
  @Expose()
  currencyCode: CurrencyCode;

  @ApiProperty()
  @Expose()
  price: number;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 country code' })
  @Expose()
  countryCode: string;
}
