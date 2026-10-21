import { Injectable } from '@nestjs/common';
import {
  GenderType,
  IdentityType,
  IntentType,
  LikeStatus,
  MatchStatus,
} from '@prisma/client';
import { parsePhoneNumberWithError } from 'libphonenumber-js';

import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';

import { MatchNotFoundException } from './application/exceptions';
import { MatchListQueryRequestDto } from './dto';

/**
 * Minimal target identity projection needed to decrypt and format
 * the public value when falling back for a match label.
 */
interface MatchTargetIdentity {
  id: string;
  type: IdentityType;
  publicValueCiphertext: string;
  publicValueIv: string;
  publicValueTag: string;
  publicValueWrappedKey: string;
  publicValueKeyId: string;
}

/**
 * Minimal database projection for a match record with both participants,
 * their like labels, and target identities. Used internally to avoid overfetching
 * and to type the `mapToResponseDto` transform safely.
 */
interface MatchWithUsers {
  id: string;
  status: MatchStatus;
  matchedAt: Date | null;
  intentOne: IntentType;
  intentTwo: IntentType;
  userOneId: string;
  userTwoId: string;
  userOne: {
    id: string;
    profile: {
      firstName: string;
      lastName: string | null;
      gender: GenderType | null;
    } | null;
  };
  userTwo: {
    id: string;
    profile: {
      firstName: string;
      lastName: string | null;
      gender: GenderType | null;
    } | null;
  };
  likeOne: {
    label: string | null;
    targetIdentity: MatchTargetIdentity;
  };
  likeTwo: {
    label: string | null;
    targetIdentity: MatchTargetIdentity;
  };
}

/**
 * Owns the core matches domain — querying active matches for a user,
 * fetching individual match details, and processing unmatch requests.
 *
 * Responses are always normalised to the requesting user's perspective:
 * `me` and `otherUser` are resolved dynamically based on whether the caller
 * is `userOne` or `userTwo` in the canonical match record.
 */
@Injectable()
export class MatchesService extends BaseService {
  private static readonly MAP_CONCURRENCY_LIMIT = 5;

  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly identityCryptoService: IdentityCryptoService,
  ) {
    super(logger);
  }

  /**
   * Fetches all ACTIVE matches for a user with cursor-style pagination,
   * excluding records where either participant has been soft-deleted.
   *
   * Runs a count and a data query in parallel via `Promise.all` to avoid
   * sequential round-trips. Results are sorted by `matchedAt` descending.
   *
   * @param userId - The authenticated user whose matches are being listed.
   * @param query  - Pagination options (`page`, `limit`).
   * @returns A paginated envelope with match summaries and pagination metadata.
   */
  async findAllForUser(userId: string, query: MatchListQueryRequestDto) {
    const { page = 1, limit = 20 } = query;
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;

    const ctx = { userId, page: safePage, limit: safeLimit };

    this.logger.debug('Fetching matches for user', {
      ...ctx,
      step: 'fetch_many',
    });

    const where = {
      OR: [{ userOneId: userId }, { userTwoId: userId }],
      status: MatchStatus.ACTIVE,
      deletedAt: null,
      userOne: { deletedAt: null },
      userTwo: { deletedAt: null },
    };

    const [total, matches] = await Promise.all([
      this.prisma.match.count({ where }),
      this.prisma.match.findMany({
        where,
        orderBy: {
          matchedAt: 'desc',
        },
        skip,
        take: safeLimit,
        select: {
          id: true,
          status: true,
          matchedAt: true,
          intentOne: true,
          intentTwo: true,
          userOneId: true,
          userTwoId: true,
          userOne: {
            select: {
              id: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  gender: true,
                },
              },
            },
          },
          userTwo: {
            select: {
              id: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  gender: true,
                },
              },
            },
          },
          likeOne: {
            select: {
              label: true,
              targetIdentity: {
                select: {
                  id: true,
                  type: true,
                  publicValueCiphertext: true,
                  publicValueIv: true,
                  publicValueTag: true,
                  publicValueWrappedKey: true,
                  publicValueKeyId: true,
                },
              },
            },
          },
          likeTwo: {
            select: {
              label: true,
              targetIdentity: {
                select: {
                  id: true,
                  type: true,
                  publicValueCiphertext: true,
                  publicValueIv: true,
                  publicValueTag: true,
                  publicValueWrappedKey: true,
                  publicValueKeyId: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / safeLimit);

    this.logger.debug('Matches fetched successfully', {
      ...ctx,
      step: 'complete',
      totalMatchesCount: total,
    });

    const data = await this.mapWithConcurrency(
      matches,
      MatchesService.MAP_CONCURRENCY_LIMIT,
      (match) => this.mapToResponseDto(match, userId),
    );

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
        hasNext: safePage < totalPages,
        hasPrev: safePage > 1,
      },
    };
  }

  /**
   * Retrieves a single match by ID, gated on the requesting user being a
   * participant in that match.
   *
   * @param matchId - UUID of the match to retrieve.
   * @param userId  - The authenticated user's ID; used to assert participation.
   * @returns The match detail DTO from the caller's perspective.
   * @throws {MatchNotFoundException} When no non-deleted match with the given ID
   *   exists where the caller is either userOne or userTwo.
   */
  async findOneForUser(matchId: string, userId: string) {
    const ctx = { userId, matchId };

    this.logger.debug('Fetching match details', {
      ...ctx,
      step: 'fetch',
    });

    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userOneId: userId }, { userTwoId: userId }],
        deletedAt: null,
        userOne: { deletedAt: null },
        userTwo: { deletedAt: null },
      },
      select: {
        id: true,
        status: true,
        matchedAt: true,
        intentOne: true,
        intentTwo: true,
        userOneId: true,
        userTwoId: true,
        userOne: {
          select: {
            id: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
                gender: true,
              },
            },
          },
        },
        userTwo: {
          select: {
            id: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
                gender: true,
              },
            },
          },
        },
        likeOne: {
          select: {
            label: true,
            targetIdentity: {
              select: {
                id: true,
                type: true,
                publicValueCiphertext: true,
                publicValueIv: true,
                publicValueTag: true,
                publicValueWrappedKey: true,
                publicValueKeyId: true,
              },
            },
          },
        },
        likeTwo: {
          select: {
            label: true,
            targetIdentity: {
              select: {
                id: true,
                type: true,
                publicValueCiphertext: true,
                publicValueIv: true,
                publicValueTag: true,
                publicValueWrappedKey: true,
                publicValueKeyId: true,
              },
            },
          },
        },
      },
    });

    if (!match) {
      this.logger.warn('Match not found', { ...ctx, step: 'fetch' });
      throw new MatchNotFoundException('Match not found');
    }

    this.logger.debug('Match details fetched successfully', {
      ...ctx,
      step: 'complete',
    });

    return await this.mapToResponseDto(match, userId);
  }

  /**
   * Dissolves an active match between the authenticated user and their partner
   * by setting the match status to UNMATCHED and recording a soft-delete timestamp.
   *
   * Emits an audit event with both user IDs so moderators can detect abuse
   * patterns (e.g., repeated unmatch after rematch cycling).
   *
   * @param matchId - UUID of the match to dissolve.
   * @param userId  - ID of the user initiating the unmatch.
   * @returns `{ success: true }` upon completion.
   * @throws {MatchNotFoundException} When no active, non-deleted match exists with
   *   the given ID where the caller is a participant.
   */
  async unmatch(matchId: string, userId: string) {
    const ctx = { userId, matchId };

    this.logger.log('Unmatching match started', { ...ctx, step: 'init' });

    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userOneId: userId }, { userTwoId: userId }],
        status: MatchStatus.ACTIVE,
        deletedAt: null,
      },
      select: {
        id: true,
        likeOneId: true,
        likeTwoId: true,
        userOneId: true,
        userTwoId: true,
      },
    });

    if (!match) {
      this.logger.warn('Match not found or already inactive for unmatch', {
        ...ctx,
        step: 'existence_check',
      });
      throw new MatchNotFoundException('Match not found or already inactive');
    }

    // Determine which like belongs to the initiator and which to the other party.
    // likeOne always belongs to userOne (canonical ordering set at match creation).
    const initiatorLikeId =
      userId === match.userOneId ? match.likeOneId : match.likeTwoId;
    const otherLikeId =
      userId === match.userOneId ? match.likeTwoId : match.likeOneId;

    this.logger.debug('Match existence verified for unmatch', {
      ...ctx,
      step: 'existence_check',
      initiatorLikeId,
      otherLikeId,
    });

    try {
      // Atomically dissolve the match, mark the initiator's like as WITHDRAWN
      // (they actively ended the relationship) and the other party's like as
      // VOIDED (ended by the system on their behalf). This asymmetry is what
      // prevents the other party from triggering an accidental re-match.
      await this.prisma.$transaction([
        this.prisma.match.update({
          where: { id: matchId },
          data: {
            status: MatchStatus.UNMATCHED,
            deletedAt: DateUtil.now(),
          },
        }),
        this.prisma.like.update({
          where: { id: initiatorLikeId },
          data: { status: LikeStatus.WITHDRAWN },
        }),
        this.prisma.like.update({
          where: { id: otherLikeId },
          data: { status: LikeStatus.VOIDED },
        }),
      ]);

      this.logger.debug(
        'Match unmatched: initiator like WITHDRAWN, other like VOIDED',
        {
          ...ctx,
          step: 'persist_unmatch',
          initiatorLikeId,
          otherLikeId,
        },
      );
    } catch (error) {
      this.logger.error('Failed to unmatch match', {
        ...ctx,
        step: 'persist_unmatch',
        err: serializeError(error),
      });
      throw error;
    }

    this.emitAuditLog({
      actionType: AuditActionType.MATCH_UNMATCHED,
      userId,
      resourceId: matchId,
      metadata: { initiatorLikeId, otherLikeId },
    });

    // Emit individual like-level audit events for abuse-detection queries.
    this.emitAuditLog({
      actionType: AuditActionType.LIKE_WITHDRAWN,
      userId,
      resourceId: initiatorLikeId,
      metadata: { matchId },
    });
    this.emitAuditLog({
      actionType: AuditActionType.LIKE_VOIDED,
      userId,
      resourceId: otherLikeId,
      metadata: { matchId },
    });

    this.logger.event(LOG_EVENT.MATCH_DISSOLVED, {
      ...ctx,
    });
    return { success: true };
  }

  /**
   * Determines whether two user intents can produce a match.
   *
   * `OPEN` intent is permissive — it is compatible with any other intent.
   * `RELATIONSHIP` and `CASUAL` must be mirrored exactly to match.
   *
   * @param intentOne - Intent of the first user.
   * @param intentTwo - Intent of the second user.
   * @returns `true` when the intents are compatible; `false` otherwise.
   */
  isIntentCompatible(intentOne: IntentType, intentTwo: IntentType): boolean {
    if (intentOne === IntentType.OPEN || intentTwo === IntentType.OPEN) {
      return true;
    }

    if (
      intentOne === IntentType.RELATIONSHIP &&
      intentTwo === IntentType.RELATIONSHIP
    ) {
      return true;
    }

    if (intentOne === IntentType.CASUAL && intentTwo === IntentType.CASUAL) {
      return true;
    }

    return false;
  }

  private async mapToResponseDto(match: MatchWithUsers, currentUserId: string) {
    const isUserOne = match.userOneId === currentUserId;
    const me = isUserOne ? match.userOne : match.userTwo;
    const otherUser = isUserOne ? match.userTwo : match.userOne;
    const myLike = isUserOne ? match.likeOne : match.likeTwo;

    const label = await this.resolveLikeLabel(myLike);

    return {
      id: match.id,
      status: match.status,
      matchedAt: match.matchedAt,
      myIntent: isUserOne ? match.intentOne : match.intentTwo,
      theirIntent: isUserOne ? match.intentTwo : match.intentOne,
      me: {
        id: me.id,
        firstName: me.profile?.firstName ?? '',
        lastName: me.profile?.lastName ?? null,
        gender: me.profile?.gender ?? null,
      },
      otherUser: {
        id: otherUser.id,
        firstName: otherUser.profile?.firstName ?? '',
        lastName: otherUser.profile?.lastName ?? null,
        gender: otherUser.profile?.gender ?? null,
        label,
      },
    };
  }

  /**
   * Resolves the label to display for the other user from the caller's perspective.
   *
   * If the caller assigned an explicit non-empty label to their like, that value is
   * returned directly (and decrypted downstream by DecryptionInterceptor if ciphertext).
   * If the like label is null or whitespace, falls back to decrypting the target identity
   * that the caller swiped on (e.g. international E.164 phone number or Instagram handle).
   *
   * @param like - The like record sent by the caller targeting the other user.
   * @returns Decrypted label string, formatted fallback identity, or null.
   */
  private async resolveLikeLabel(
    like?: {
      label: string | null;
      targetIdentity?: MatchTargetIdentity | null;
    } | null,
  ): Promise<string | null> {
    if (!like) {
      return null;
    }

    if (
      like.label !== null &&
      like.label !== undefined &&
      like.label.trim().length > 0
    ) {
      return like.label;
    }

    if (!like.targetIdentity) {
      return null;
    }

    return this.decryptTargetIdentityValue(like.targetIdentity);
  }

  /**
   * Decrypts the public value of a target identity and normalises its output format.
   *
   * For PHONE identities, formats the number into international E.164 (`+` prefix).
   * For other identity types (INSTAGRAM, EMAIL, etc.), returns the decrypted string as-is.
   * Catches and suppresses decryption errors to prevent single-record failures from
   * crashing the entire match list.
   *
   * @param targetIdentity - The encrypted target identity projection from the DB.
   * @returns Formatted identity string, or null on failure.
   */
  private async decryptTargetIdentityValue(
    targetIdentity: MatchTargetIdentity,
  ): Promise<string | null> {
    try {
      const decrypted = await this.identityCryptoService.decryptPublicValue({
        publicValueCiphertext: targetIdentity.publicValueCiphertext,
        publicValueIv: targetIdentity.publicValueIv,
        publicValueTag: targetIdentity.publicValueTag,
        publicValueWrappedKey: targetIdentity.publicValueWrappedKey,
        publicValueKeyId: targetIdentity.publicValueKeyId,
      });

      if (!decrypted || decrypted.trim().length === 0) {
        return null;
      }

      if (targetIdentity.type === IdentityType.PHONE) {
        return this.formatPhoneNumber(decrypted);
      }

      return decrypted;
    } catch (error) {
      this.logger.warn(
        'Failed to decrypt target identity for match label fallback',
        {
          identityId: targetIdentity.id,
          identityType: targetIdentity.type,
          step: 'decrypt_target_identity_label',
          err: serializeError(error),
        },
      );
      return null;
    }
  }

  /**
   * Formats a raw phone string into readable standard international format with spacing.
   *
   * Uses `libphonenumber-js` to parse and format into country-standard representation
   * (e.g. `"+91 98765 43210"` for India, `"+1 415 555 2671"` for the US).
   * If parsing fails, falls back gracefully to `+<digits>`.
   *
   * @param rawPhone - Digits or partially formatted phone number string.
   * @returns Formatted international phone string.
   */
  private formatPhoneNumber(rawPhone: string): string {
    const trimmed = rawPhone.trim();
    const candidate = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
    try {
      const parsed = parsePhoneNumberWithError(candidate);
      if (parsed.isValid()) {
        return parsed.formatInternational();
      }
    } catch {
      // Graceful degradation when parsing fails
    }
    return candidate;
  }

  /**
   * Maps an array of items with a bounded concurrency pool to prevent unbounded
   * parallel RPC calls (e.g. KMS envelope key unwrapping during match label fallback).
   *
   * @param items - Collection of items to process.
   * @param limit - Maximum number of concurrent tasks.
   * @param fn - Asynchronous mapping function applied to each item.
   * @returns An array containing the mapped results in identical order.
   */
  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    if (items.length === 0) {
      return [];
    }

    const results = new Array<R>(items.length);
    let index = 0;

    const worker = async () => {
      while (index < items.length) {
        const current = index++;
        results[current] = await fn(items[current]);
      }
    };

    const workerCount = Math.min(limit, items.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return results;
  }
}
