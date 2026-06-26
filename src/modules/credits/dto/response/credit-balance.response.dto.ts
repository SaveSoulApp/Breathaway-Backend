import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Response shape for `GET /credits/balance`; reports the caller's current net spendable
 * credit balance (total CREDIT minus total DEBIT).
 */
export class CreditBalanceResponseDto {
  @ApiProperty({ description: 'The current credit balance of the user' })
  @Expose()
  balance: number;
}
