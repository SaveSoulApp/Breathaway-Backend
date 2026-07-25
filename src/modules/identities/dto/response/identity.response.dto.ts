import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IdentityType } from '@prisma/client';
import { Expose } from 'class-transformer';

/**
 * Safe, masked representation of an identity returned by most endpoints.
 *
 * Plaintext `publicValue` and `platformId` are never included in this shape;
 * only `publicValueMasked` (e.g. `"+91••••7890"`) is exposed for display purposes.
 * Use `IdentityCompleteResponseDto` for routes that intentionally expose the plaintext.
 */
export class IdentityResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ enum: IdentityType })
  @Expose()
  type: IdentityType;

  @ApiProperty()
  @Expose()
  isVerified: boolean;

  @ApiPropertyOptional()
  @Expose()
  verifiedAt: Date | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiPropertyOptional()
  @Expose()
  deletedAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  userId: string | null;

  /** Display-safe masked form of the public value (e.g. `"+91••••7890"`); never the plaintext. */
  @ApiPropertyOptional()
  @Expose()
  publicValueMasked: string | null;
}
