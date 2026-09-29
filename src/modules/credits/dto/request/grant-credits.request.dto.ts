import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreditSource } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

/**
 * Payload for `POST /credits/internal/grant`; submitted by admin or internal services
 * to award credits to a user. `LIKE_USAGE` is rejected at the service layer — use a
 * valid source enum value.
 *
 * Credits granted via PURCHASE and SUBSCRIPTION sources are always permanent
 * (expiresAt = null). Only BONUS, REFERRAL, and ADMIN grants may carry an
 * optional expiry via `expiryDays`. If `expiryDays` is absent, the granted
 * bundle is also permanent.
 */
export class GrantCreditsRequestDto {
  @ApiProperty({ description: 'The ULID of the user receiving the credits' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Amount of credits to grant (must be positive)' })
  @IsInt()
  @IsPositive()
  amount: number;

  /**
   * Case-insensitive; transformed to uppercase before validation.
   * `LIKE_USAGE` is a system-only source and will be rejected by the service.
   */
  @ApiProperty({ enum: CreditSource, description: 'Source of the credits' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(CreditSource)
  source: CreditSource;

  /** Links this grant to an external event (e.g., campaign ID, subscription ID) for traceability. */
  @ApiPropertyOptional({
    description: 'Optional reference ID (e.g. campaign ID)',
  })
  @IsString()
  @IsOptional()
  referenceId?: string;

  /**
   * Number of days from now until this credit bundle expires.
   * Only applicable for BONUS, REFERRAL, and ADMIN sources — the server
   * computes the exact `expiresAt` date. When absent (or zero), the bundle
   * is permanent and never expires.
   *
   * @minimum 1
   */
  @ApiPropertyOptional({
    description:
      'Optional expiry window in days (BONUS/REFERRAL/ADMIN only). Omit for permanent credits.',
    minimum: 1,
    example: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expiryDays?: number | null;
}
