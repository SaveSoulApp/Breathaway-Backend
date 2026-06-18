import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto/audit-event.dto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { GenderType, IntentType, MatchStatus } from '@prisma/client';
import { MatchListQueryDto } from './dto';

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
}

@Injectable()
export class MatchesService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  async findAllForUser(userId: string, query: MatchListQueryDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

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
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

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

  async findOneForUser(matchId: string, userId: string) {
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
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    return this.mapToResponseDto(match, userId);
  }

  async unmatch(matchId: string, userId: string) {
    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userOneId: userId }, { userTwoId: userId }],
        status: MatchStatus.ACTIVE,
        deletedAt: null,
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found or already inactive');
    }

    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.UNMATCHED,
        deletedAt: DateUtil.now(),
      },
    });

    this.emitAuditLog({
      actionType: AuditActionType.MATCH_UNMATCHED,
      userId: userId,
      resourceId: matchId,
    });

    return { success: true };
  }

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
      },
    };
  }
}
