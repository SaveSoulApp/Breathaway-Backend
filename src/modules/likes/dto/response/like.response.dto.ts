import { PaginationMeta } from '@common/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IdentityType, IntentType, LikeStatus } from '@prisma/client';
import { Expose, Type } from 'class-transformer';

export class LikeTargetIdentityDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ enum: IdentityType })
  @Expose()
  type: IdentityType;

  @ApiPropertyOptional()
  @Expose()
  publicValueMasked: string | null;

  @ApiProperty()
  @Expose()
  isVerified: boolean;

  @ApiPropertyOptional()
  @Expose()
  verifiedAt: Date | null;
}

export class LikeResponseDto {
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

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiPropertyOptional()
  @Expose()
  expiresAt: Date | null;
}

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
