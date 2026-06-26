import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, IsString } from 'class-validator';

/**
 * Payload for the `POST /credits/internal/consume` endpoint; used by internal services
 * to deduct credits from a user's account for feature usage.
 */
export class ConsumeCreditsRequestDto {
  @ApiProperty({ description: 'The ULID of the user consuming credits' })
  @IsString()
  userId: string;

  @ApiProperty({
    description:
      'Amount of credits to consume (positive value, will be deducted)',
  })
  @IsInt()
  @IsPositive()
  amount: number;

  /** ULID of the resource that triggered the debit (e.g., a Like ID); links the ledger row back to the originating action for auditability. */
  @ApiProperty({ description: 'Reference ID (e.g. likeId)' })
  @IsString()
  referenceId: string;
}
