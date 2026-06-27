import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsString } from 'class-validator';

/**
 * Pub/Sub message payload published by the fan-out coordinator for each
 * paginated batch of users whose credit bundles need expiration evaluation.
 *
 * `asOf` is the coordinator's `now` snapshot, pinned once for the entire job
 * run so all batches evaluate expiry against the same point in time regardless
 * of when the Pub/Sub message is delivered or retried.
 */
export class CreditExpiryBatchRequestDto {
  /** Ordered list of user IDs in this batch to evaluate for credit expiration. */
  @ApiProperty({
    description: 'Array of user IDs to evaluate for credit bundle expiration',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  userIds: string[];

  /**
   * ISO-8601 timestamp captured at fan-out time.
   * Used as the authoritative "now" when evaluating whether a credit bundle
   * has expired, ensuring consistency across all batches in the same job run.
   */
  @ApiProperty({
    description: 'ISO-8601 timestamp pinned at fan-out time (authoritative "now")',
  })
  @IsDateString()
  asOf: string;
}
