import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsString, Length } from 'class-validator';

/**
 * Request body for batch reordering routes for a given country.
 */
export class ReorderPaymentRoutesRequestDto {
  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 country code.',
    example: 'IN',
  })
  @IsString()
  @Length(2, 2)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value,
  )
  countryCode: string;

  @ApiProperty({
    description:
      'Ordered array of route ULIDs for this country. Index 0 becomes Step 1, Index 1 becomes Step 2, etc. ' +
      'Must contain all existing route IDs for the country without duplicates or omissions.',
    example: ['01J8VXYZ1234ABCDEFGHJKMNPQ', '01J8VXYZ5678ABCDEFGHJKMNPR'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  routeIds: string[];
}
