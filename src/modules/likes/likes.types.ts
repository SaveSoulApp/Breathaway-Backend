import { IdentityType, LikeStatus } from '@prisma/client';

/** Minimal targetIdentity shape returned by like queries. */
export type RawLikeIdentity = {
  id: string;
  type: IdentityType;
  isVerified: boolean;
  verifiedAt: Date | null;
};

/** Shape of a raw like row as returned from the DB (before publicValue is attached). */
export type RawLike = {
  id: string;
  intent: string;
  status: LikeStatus;
  label: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  targetIdentity: RawLikeIdentity;
  senderUserId?: string;
  targetUserId?: string | null;
};

/** The Prisma select clause reused across all like queries. */
export const LIKE_SELECT = {
  id: true,
  intent: true,
  status: true,
  label: true,
  createdAt: true,
  expiresAt: true,
  targetIdentity: {
    select: {
      id: true,
      type: true,
      isVerified: true,
      verifiedAt: true,
    },
  },
} as const;
