import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IdentityType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Payload for POST /identities — registers a new verifiable contact identity for the user.
 *
 * If an unowned identity already exists with a matching type + hashed value, the service
 * will claim it rather than reject the request. Owned duplicates throw a ConflictException.
 * Both `publicValue` and `platformId` are lowercased before hashing and encryption.
 */
export class CreateIdentityDto {
  /** Determines the normalisation and hashing strategy applied to `publicValue`. */
  @ApiProperty({ enum: IdentityType, description: 'Type of the identity' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(IdentityType)
  type: IdentityType;

  /** Raw contact value (e.g. `"+14155550123"`, `"@handle"`); lowercased and then encrypted + hashed. */
  @ApiProperty({
    description: 'Public value (e.g., phone number, email, social handle)',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  publicValue: string;

  /**
   * Provider-issued numeric identifier stable across handle/name changes (e.g. Instagram user ID).
   * Stored as a hash; used as a secondary lookup key alongside `publicValueHash`.
   */
  @ApiPropertyOptional({
    description: 'Constant numeric platform ID (e.g., Instagram numerical ID)',
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  platformId?: string;
}
