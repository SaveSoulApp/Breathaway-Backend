import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IdentityType, IntentType, LikeStatus } from '@prisma/client';
import { Expose, Type } from 'class-transformer';

import { BaseAuditExcludeDto, PaginationMeta } from '@common/dto';

/**
 * Minimal target identity shape embedded in every like response.
 *
 * `publicValue` is decrypted by the service before serialisation — callers always
 * receive the plaintext value (e.g. the full phone number or handle).
 */
export class LikeTargetIdentityDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ enum: IdentityType })
  @Expose()
  type: IdentityType;

  @ApiProperty()
  @Expose()
  publicValue: string;
}

/**
 * Response shape for a single like — returned by POST, GET /:id, and PATCH /:id/label.
 */
export class LikeResponseDto extends BaseAuditExcludeDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ enum: IntentType })
  @Expose()
  intent: IntentType;

  @ApiProperty({ enum: LikeStatus })
  @Expose()
  status: LikeStatus;

  @ApiPropertyOptional({
    description:
      "A personal label to remember who this like is for (e.g. 'Sarah', 'My Crush')",
  })
  @Expose()
  label: string | null;

  @ApiProperty({ type: LikeTargetIdentityDto })
  @Expose()
  @Type(() => LikeTargetIdentityDto)
  targetIdentity: LikeTargetIdentityDto;

  @ApiPropertyOptional()
  @Expose()
  expiresAt: Date | null;
}

/**
 * Paginated wrapper returned by GET /likes.
 *
 * `meta` carries cursor information (page, limit, total, hasNext, hasPrev) to
 * support client-side infinite-scroll or page-based navigation.
 */
export class PaginatedLikeResponseDto {
  @ApiProperty({ type: [LikeResponseDto] })
  @Expose()
  @Type(() => LikeResponseDto)
  data: LikeResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  @Expose()
  @Type(() => PaginationMeta)
  meta: PaginationMeta;
}
