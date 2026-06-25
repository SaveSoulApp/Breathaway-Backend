import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

/**
 * Payload for PATCH /identities/:id — updates an identity's public value and/or platform ID.
 *
 * Both fields are optional but at least one must be non-null for any DB write to occur;
 * if neither is provided the service returns the existing record unchanged. Values are
 * lowercased, re-encrypted, and re-hashed before writing. Duplicate detection runs
 * against all other active identities of the same type.
 */
export class UpdateIdentityDto {
  @ApiPropertyOptional({
    description: 'Public value (e.g., phone number, email, social handle)',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  publicValue?: string;

  @ApiPropertyOptional({
    description: 'Constant numeric platform ID (e.g., Instagram numerical ID)',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  platformId?: string;
}
