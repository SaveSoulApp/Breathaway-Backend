import { ApiProperty } from '@nestjs/swagger';
import { CreditSource, CreditTransactionType } from '@prisma/client';
import { Expose } from 'class-transformer';

/* istanbul ignore next */
export class CreditLedgerResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ enum: CreditTransactionType })
  @Expose()
  transactionType: CreditTransactionType;

  @ApiProperty()
  @Expose()
  amount: number;

  @ApiProperty({ enum: CreditSource })
  @Expose()
  source: CreditSource;

  @ApiProperty({ required: false })
  @Expose()
  referenceId: string | null;

  @ApiProperty({ required: false })
  @Expose()
  expiresAt: Date | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;
}
