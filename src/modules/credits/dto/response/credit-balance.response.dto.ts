import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/* istanbul ignore next */
export class CreditBalanceResponseDto {
  @ApiProperty({ description: 'The current credit balance of the user' })
  @Expose()
  balance: number;
}
