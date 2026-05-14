import { IdentityType } from '@prisma/client';
import { Expose } from 'class-transformer';

export class IdentityResponseDto {
  @Expose()
  id: string;

  @Expose()
  type: IdentityType;

  @Expose()
  isVerified: boolean;

  @Expose()
  verifiedAt: Date | null;

  @Expose()
  createdAt: Date;

  @Expose()
  deletedAt: Date | null;

  @Expose()
  userId: string | null;

  @Expose()
  publicValueMasked: string | null;
}