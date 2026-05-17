import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IntentType, LikeStatus, IdentityType } from '@prisma/client';

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

/* istanbul ignore next */
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
