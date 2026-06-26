import { ApiProperty } from '@nestjs/swagger';
import { CreditSource } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Payload for `POST /credits/internal/grant`; submitted by admin or internal services
 * to award credits to a user. `LIKE_USAGE` is rejected at the service layer — use a
 * valid source enum value.
 */
export class GrantCreditsRequestDto {
  @ApiProperty({ description: 'The ULID of the user receiving the credits' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Amount of credits to grant (must be positive)' })
  @IsInt()
  @IsPositive()
  amount: number;

  /** Case-insensitive; transformed to uppercase before validation. `LIKE_USAGE` is a system-only source and will be rejected by the service. */
  @ApiProperty({ enum: CreditSource, description: 'Source of the credits' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(CreditSource)
  source: CreditSource;

  /** Links this grant to an external event (e.g., campaign ID, subscription ID) for traceability. */
  @ApiProperty({
    required: false,
    description: 'Optional reference ID (e.g. campaign ID)',
  })
  @IsString()
  @IsOptional()
  referenceId?: string;

  /** ISO 8601 date string; when provided, the granted credit bundle expires at this timestamp and any unused portion will be swept by the expiration job. */
  @ApiProperty({
    required: false,
    description: 'Optional expiration date in ISO format',
  })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
