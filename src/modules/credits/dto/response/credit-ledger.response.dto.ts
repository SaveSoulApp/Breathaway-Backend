import { ApiProperty } from '@nestjs/swagger';
import { CreditSource, CreditTransactionType } from '@prisma/client';
import { Expose } from 'class-transformer';

/**
 * Represents a single credit ledger entry returned by `GET /credits/ledger` and
 * `GET /credits/ledger/:id`; each row is an immutable transaction record.
 */
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

  /** `null` for permanent credits (e.g., `PURCHASE` source); non-null for time-limited bundles subject to the expiration job. */
  @ApiProperty({ required: false })
  @Expose()
  expiresAt: Date | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;
}
