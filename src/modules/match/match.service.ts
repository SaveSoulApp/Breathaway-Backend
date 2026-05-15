import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IntentType, MatchStatus } from '@prisma/client';
import { BaseService } from 'src/base/services/base.service';
import { LoggerService } from 'src/core/logger/logger.service';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { BlockService } from 'src/modules/block/block.service';
import { CreateMatchDto } from './dto';

@Injectable()
export class MatchService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly blockService: BlockService,
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

  async createFromLikes(dto: CreateMatchDto) {
    const { likeOneId, likeTwoId } = dto;

    if (likeOneId === likeTwoId) {
      throw new BadRequestException('Likes must be distinct');
    }

    // 1. Fetch both likes
    const likeOne = await this.prisma.like.findUnique({
      where: { id: likeOneId },
    });
    const likeTwo = await this.prisma.like.findUnique({
      where: { id: likeTwoId },
    });

    if (!likeOne || !likeTwo) {
      throw new NotFoundException('One or both likes not found');
    }

    // 2. Verify reverse relationship
    if (
      likeOne.senderUserId !== likeTwo.targetUserId ||
      likeTwo.senderUserId !== likeOne.targetUserId
    ) {
      throw new BadRequestException('Likes do not form a mutual connection');
    }

    const userAId = likeOne.senderUserId;
    const userBId = likeTwo.senderUserId;

    // 3. Verify intent compatibility
    if (!this.isIntentCompatible(likeOne.intent, likeTwo.intent)) {
      throw new ConflictException('Intents are not compatible');
    }

    // 4. Verify no block exists
    const isBlocked = await this.blockService.isBlocked(userAId, userBId);
    if (isBlocked) {
      throw new ConflictException('A block exists between these users');
    }

    // 5. Sort user IDs canonically
    const [userOneId, userTwoId] = [userAId, userBId].sort();

    // 6. Ensure match does not already exist
    const existingMatch = await this.prisma.match.findUnique({
      where: {
        userOneId_userTwoId: {
          userOneId,
          userTwoId,
        },
      },
    });

    if (existingMatch && existingMatch.status === MatchStatus.ACTIVE) {
      throw new ConflictException(
        'An active match already exists between these users',
      );
    }

    const canonicalLikeOne = userOneId === userAId ? likeOne : likeTwo;
    const canonicalLikeTwo = userTwoId === userBId ? likeTwo : likeOne;

    // 7. Create match transactionally and 8. Update both likes to MATCHED
    await this.prisma.$transaction(async (tx) => {
      if (existingMatch) {
        await tx.match.update({
          where: { id: existingMatch.id },
          data: {
            likeOneId: canonicalLikeOne.id,
            likeTwoId: canonicalLikeTwo.id,
            intentOne: canonicalLikeOne.intent,
            intentTwo: canonicalLikeTwo.intent,
            status: MatchStatus.ACTIVE,
            deletedAt: null,
            matchedAt: new Date(),
          },
        });
      } else {
        await tx.match.create({
          data: {
            userOneId,
            userTwoId,
            likeOneId: canonicalLikeOne.id,
            likeTwoId: canonicalLikeTwo.id,
            intentOne: canonicalLikeOne.intent,
            intentTwo: canonicalLikeTwo.intent,
            status: MatchStatus.ACTIVE,
          },
        });
      }

      await tx.like.update({
        where: { id: likeOneId },
        data: { status: 'MATCHED' },
      });

      await tx.like.update({
        where: { id: likeTwoId },
        data: { status: 'MATCHED' },
      });
    });

    return { success: true };
  }

  private isIntentCompatible(intentOne: IntentType, intentTwo: IntentType): boolean {
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
