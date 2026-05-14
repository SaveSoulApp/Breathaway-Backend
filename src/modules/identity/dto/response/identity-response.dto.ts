import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IdentityType } from '@prisma/client';
import { Expose } from 'class-transformer';

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

  @ApiPropertyOptional()
  @Expose()
  publicValueMasked: string | null;
}