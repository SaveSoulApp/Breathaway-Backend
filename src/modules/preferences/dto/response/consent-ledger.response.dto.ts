import { ApiProperty } from '@nestjs/swagger';
import { ConsentChannel, ConsentSource } from '@prisma/client';
import { Expose } from 'class-transformer';

/**
 * Response payload representing an immutable audit log entry in the user's consent ledger.
 *
 * Returned by GET /preferences/consents to demonstrate the full audit history of consent
 * grants and revocations across channels, fulfilling GDPR Article 7 and privacy audit standards.
 */
export class ConsentLedgerResponseDto {
  /** Unique identifier of the consent ledger entry. */
  @ApiProperty({
    description: 'Unique ULID identifier of the consent ledger entry',
  })
  @Expose()
  id: string;

  /** Communication channel for which consent was granted or revoked. */
  @ApiProperty({
    enum: ConsentChannel,
    description: 'Communication channel (PUSH, EMAIL, SMS, WHATSAPP)',
  })
  @Expose()
  channel: ConsentChannel;

  /** Indicates whether consent was granted (true) or revoked (false). */
  @ApiProperty({
    description: 'Whether consent was granted (true) or revoked (false)',
  })
  @Expose()
  consentGranted: boolean;

  /** Origin or trigger mechanism through which consent was updated. */
  @ApiProperty({
    enum: ConsentSource,
    description: 'Source or trigger of the consent action',
  })
  @Expose()
  source: ConsentSource;

  /** Immutable timestamp when the consent state transition was recorded. */
  @ApiProperty({ description: 'Timestamp when the consent event was recorded' })
  @Expose()
  createdAt: Date;
}
