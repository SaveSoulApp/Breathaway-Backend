import { IdentityType, IntentType, LikeStatus } from '@prisma/client';

/** Minimal targetIdentity shape returned by like queries. */
export type RawLikeIdentity = {
  id: string;
  type: IdentityType;
};

/** Shape of a raw like row as returned from the DB (before publicValue is attached). */
export type RawLike = {
  id: string;
  intent: IntentType;
  status: LikeStatus;
  label: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  targetIdentity: RawLikeIdentity;
  senderUserId?: string;
};

/**
 * Extended shape returned by the create transaction — includes extra fields
 * needed for match resolution and audit logging that are not part of the standard
 * LIKE_SELECT used by read operations.
 */
export type CreateLikeResult = RawLike & {
  senderUserId: string;
  targetIdentityId: string;
  targetIdentity: RawLikeIdentity & { userId: string | null };
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
    },
  },
} as const;
