import { Injectable } from '@nestjs/common';
import { GenderType, IntentType, MatchStatus } from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';

import { MatchNotFoundException } from './application/exceptions';
import { MatchListQueryRequestDto } from './dto';

/**
 * Minimal database projection for a match record with both participants and
 * their like labels. Used internally to avoid overfetching and to type the
 * `mapToResponseDto` transform safely.
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
  };
  likeTwo: {
    label: string | null;
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
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
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
    const skip = (page - 1) * limit;

    const ctx = { userId, page, limit };

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
        take: limit,
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
            },
          },
          likeTwo: {
            select: {
              label: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    this.logger.debug('Matches fetched successfully', {
      ...ctx,
      step: 'complete',
      totalMatchesCount: total,
    });

    return {
      data: matches.map((match) => this.mapToResponseDto(match, userId)),
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
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
          },
        },
        likeTwo: {
          select: {
            label: true,
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

    return this.mapToResponseDto(match, userId);
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
    });

    if (!match) {
      this.logger.warn('Match not found or already inactive for unmatch', {
        ...ctx,
        step: 'existence_check',
      });
      throw new MatchNotFoundException('Match not found or already inactive');
    }

    this.logger.debug('Match existence verified for unmatch', {
      ...ctx,
      step: 'existence_check',
    });

    try {
      await this.prisma.match.update({
        where: { id: matchId },
        data: {
          status: MatchStatus.UNMATCHED,
          deletedAt: DateUtil.now(),
        },
      });

      this.logger.debug('Match record updated for unmatch', {
        ...ctx,
        step: 'persist_unmatch',
      });
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
      userId: userId,
      resourceId: matchId,
    });

    this.logger.log('Match unmatched successfully', {
      ...ctx,
      step: 'complete',
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

  private mapToResponseDto(match: MatchWithUsers, currentUserId: string) {
    const isUserOne = match.userOneId === currentUserId;
    const me = isUserOne ? match.userOne : match.userTwo;
    const otherUser = isUserOne ? match.userTwo : match.userOne;
    const theirLike = isUserOne ? match.likeTwo : match.likeOne;

    return {
      id: match.id,
      status: match.status,
      matchedAt: match.matchedAt,
      myIntent: isUserOne ? match.intentOne : match.intentTwo,
      theirIntent: isUserOne ? match.intentTwo : match.intentOne,
      me: {
        id: me.id,
        firstName: me.profile?.firstName,
        lastName: me.profile?.lastName,
        gender: me.profile?.gender ?? null,
      },
      otherUser: {
        id: otherUser.id,
        firstName: otherUser.profile?.firstName,
        lastName: otherUser.profile?.lastName,
        gender: otherUser.profile?.gender ?? null,
        label: theirLike?.label ?? null,
      },
    };
  }
}
