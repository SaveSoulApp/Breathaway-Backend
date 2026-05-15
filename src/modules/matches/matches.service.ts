import { Injectable, NotFoundException } from '@nestjs/common';
import { IntentType, MatchStatus } from '@prisma/client';
import { BaseService } from 'src/base/services/base.service';
import { LoggerService } from 'src/core/logger/logger.service';
import { PrismaService } from 'src/core/prisma/prisma.service';

@Injectable()
export class MatchService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  async findAllForUser(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: {
        OR: [{ userOneId: userId }, { userTwoId: userId }],
        status: MatchStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: {
        matchedAt: 'desc',
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
              },
            },
          },
        },
      },
    });

    return matches.map((match) => this.mapToResponseDto(match, userId));
  }

  async findOneForUser(matchId: string, userId: string) {
    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userOneId: userId }, { userTwoId: userId }],
        deletedAt: null,
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
        deletedAt: new Date(),
      },
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

  private mapToResponseDto(match: any, currentUserId: string) {
    const isUserOne = match.userOneId === currentUserId;
    const otherUser = isUserOne ? match.userTwo : match.userOne;

    return {
      id: match.id,
      status: match.status,
      matchedAt: match.matchedAt,
      intentOne: match.intentOne,
      intentTwo: match.intentTwo,
      otherUser: {
        id: otherUser.id,
        firstName: otherUser.profile?.firstName,
        lastName: otherUser.profile?.lastName,
      },
    };
  }
}
