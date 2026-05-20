import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { BlockService } from '@modules/blocks/blocks.service';
import { MatchService } from '@modules/matches/matches.service';
import { Injectable } from '@nestjs/common';
import { Like, LikeStatus, Match, MatchStatus } from '@prisma/client';

export type LikeSummary = Pick<
  Like,
  'id' | 'senderUserId' | 'targetUserId' | 'intent' | 'status'
>;

@Injectable()
export class MatchResolverService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly matchService: MatchService,
    private readonly blockService: BlockService,
  ) {
    super(logger);
  }

  async resolveFromLike(newLike: LikeSummary) {
    try {
      if (!newLike.targetUserId) {
        this.logger.debug(
          `Like ${newLike.id} target identity is unresolved. Skipping match resolution.`,
        );
        return;
      }

      const reverseLike = await this.findReverseLike(
        newLike.senderUserId,
        newLike.targetUserId,
      );

      if (!reverseLike) {
        this.logger.debug(
          `No reverse like found for users ${newLike.senderUserId} and ${newLike.targetUserId}.`,
        );
        return;
      }

      this.logger.log(
        `Reverse like found: ${reverseLike.id} for new like: ${newLike.id}.`,
      );

      const [userOneId, userTwoId] = [
        newLike.senderUserId,
        newLike.targetUserId,
      ].sort();

      const canonicalLikeOne =
        userOneId === newLike.senderUserId ? newLike : reverseLike;
      const canonicalLikeTwo =
        userTwoId === newLike.targetUserId ? reverseLike : newLike;

      const isEligible = await this.validateMatchEligibility(
        newLike,
        reverseLike,
        userOneId,
        userTwoId,
      );

      if (!isEligible.valid) return;

      await this.executeMatchTransaction(
        canonicalLikeOne,
        canonicalLikeTwo,
        userOneId,
        userTwoId,
        isEligible.existingMatch,
      );

      this.logger.log(
        `Match created successfully between users ${userOneId} and ${userTwoId}.`,
      );
    } catch (error) {
      const err = error as { code?: string; stack?: string };
      if (err?.code === 'P2002') {
        this.logger.warn(
          `Race condition caught: Unique constraint violation while creating Match for users ${newLike.senderUserId} and ${newLike.targetUserId}.`,
        );
        return;
      }

      this.logger.error(`Failed to resolve match for Like ${newLike.id}`, {
        stack: err.stack,
      });
    }
  }

  private async findReverseLike(
    userAId: string,
    userBId: string,
  ): Promise<LikeSummary | null> {
    return this.prisma.like.findFirst({
      where: {
        senderUserId: userBId,
        targetUserId: userAId,
        status: LikeStatus.PENDING,
        deletedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  private async validateMatchEligibility(
    newLike: LikeSummary,
    reverseLike: LikeSummary,
    userOneId: string,
    userTwoId: string,
  ): Promise<{ valid: boolean; existingMatch: Match | null }> {
    if (
      !this.matchService.isIntentCompatible(newLike.intent, reverseLike.intent)
    ) {
      this.logger.log(
        `Intents are incompatible between Like ${newLike.id} (${newLike.intent}) and Like ${reverseLike.id} (${reverseLike.intent}).`,
      );
      return { valid: false, existingMatch: null };
    }

    const isBlocked = await this.blockService.isBlocked(
      newLike.senderUserId,
      newLike.targetUserId!,
    );

    if (isBlocked) {
      this.logger.log(
        `Block exists between users ${newLike.senderUserId} and ${newLike.targetUserId}. Suppressing match.`,
      );
      return { valid: false, existingMatch: null };
    }

    const existingMatch = await this.prisma.match.findUnique({
      where: { userOneId_userTwoId: { userOneId, userTwoId } },
    });

    if (existingMatch && existingMatch.status === MatchStatus.ACTIVE) {
      this.logger.warn(
        `Active match already exists between ${userOneId} and ${userTwoId}. Duplicate prevented.`,
      );
      return { valid: false, existingMatch: null };
    }

    return { valid: true, existingMatch };
  }

  private async executeMatchTransaction(
    likeOne: LikeSummary,
    likeTwo: LikeSummary,
    userOneId: string,
    userTwoId: string,
    existingMatch: Match | null,
  ) {
    await this.prisma.$transaction(async (tx) => {
      if (existingMatch) {
        await tx.match.update({
          where: { id: existingMatch.id },
          data: {
            likeOneId: likeOne.id,
            likeTwoId: likeTwo.id,
            intentOne: likeOne.intent,
            intentTwo: likeTwo.intent,
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
            likeOneId: likeOne.id,
            likeTwoId: likeTwo.id,
            intentOne: likeOne.intent,
            intentTwo: likeTwo.intent,
            status: MatchStatus.ACTIVE,
          },
        });
      }

      await tx.like.update({
        where: { id: likeOne.id },
        data: { status: LikeStatus.MATCHED },
      });

      await tx.like.update({
        where: { id: likeTwo.id },
        data: { status: LikeStatus.MATCHED },
      });
    });
  }
}
