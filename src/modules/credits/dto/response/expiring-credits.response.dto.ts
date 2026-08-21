import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class ExpiringCreditItemDto {
  @ApiProperty({ description: 'The UUID of the credit ledger entry' })
  @Expose()
  creditId: string;

  @ApiProperty({
    description:
      'The remaining spendable balance of this specific credit bundle',
  })
  @Expose()
  remainingBalance: number;

  @ApiProperty({
    description:
      'When this credit bundle expires, or null if it does not expire',
    nullable: true,
  })
  @Expose()
  expiresAt: Date | null;
}

export class ExpiringCreditsResponseDto {
  @ApiProperty({
    description:
      'List of active credit bundles with their remaining balances and expiry dates',
    type: [ExpiringCreditItemDto],
  })
  @Expose()
  @Type(() => ExpiringCreditItemDto)
  data: ExpiringCreditItemDto[];
}
