import { ApiProperty } from '@nestjs/swagger';
import { CreditSource } from '@prisma/client';
import { Expose } from 'class-transformer';

export class CreditLedgerResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

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
