import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IdentityType, IntentType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Inline identity payload used when the caller does not yet have an identity ID.
 *
 * The service will normalise `publicValue` and `platformId` to lowercase before hashing.
 * If an identity already exists with the same type + hash, the like is linked to that
 * existing record rather than creating a duplicate.
 */
export class TargetIdentityInputDto {
  /** Determines which normalisation and hashing strategy is applied to `publicValue`. */
  @ApiProperty({
    enum: IdentityType,
    description: 'Type of identity to resolve or create',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(IdentityType)
  @IsNotEmpty()
  type: IdentityType;

  /** Raw human-readable value (e.g. phone number, Instagram handle); lowercased before hashing. */
  @ApiProperty({
    description: 'The raw public value (e.g. phone number, IG handle)',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  publicValue: string;

  /**
   * Platform-specific numeric ID (e.g. Instagram user ID) used as a secondary key.
   * Stored as a hash; lowercased before hashing.
   */
  @ApiPropertyOptional({ description: 'Constant numeric platform ID' })
  @IsString()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  platformId?: string;
}

/**
 * Payload for POST /likes — records a user's intent to connect with another person.
 *
 * Exactly one of `targetIdentityId` or `targetIdentity` must be provided; the service
 * will throw if both are absent.
 */
export class CreateLikeRequestDto {
  /**
   * Preferred when the identity ID is already known (e.g. from a prior search result).
   * Mutually exclusive with `targetIdentity`; if both are supplied, this takes precedence.
   */
  @ApiPropertyOptional({
    description: 'Existing Identity ID, if already known',
  })
  @IsOptional()
  @IsString()
  targetIdentityId?: string;

  @ApiPropertyOptional({
    type: TargetIdentityInputDto,
    description:
      'Raw identity input to resolve or create if targetIdentityId is not provided',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TargetIdentityInputDto)
  targetIdentity?: TargetIdentityInputDto;

  @ApiProperty({ enum: IntentType })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(IntentType)
  @IsNotEmpty()
  intent: IntentType;

  @ApiPropertyOptional({
    description:
      "A personal label to remember who this like is for (e.g. 'Sarah', 'My Crush')",
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}
