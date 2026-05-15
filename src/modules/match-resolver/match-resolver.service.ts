import { Injectable } from '@nestjs/common';
import { Like, LikeStatus, MatchStatus } from '@prisma/client';
import { BaseService } from '@core/base/base.service';
import { LoggerService } from '@core/logger/logger.service';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { BlockService } from '@modules/blocks/blocks.service';
import { MatchService } from '@modules/matches/matches.service';

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

  async resolveFromLike(newLike: Like) {
    try {
      // 1. Only trigger if targetUserId is resolved
      if (!newLike.targetUserId) {
        this.logger.debug(
          `Like ${newLike.id} target identity is unresolved. Skipping match resolution.`,
        );
        return;
      }

      const userAId = newLike.senderUserId;
      const userBId = newLike.targetUserId;

      // 2. Search for a reverse Like
      const reverseLike = await this.prisma.like.findFirst({
        where: {
          senderUserId: userBId,
          targetUserId: userAId,
          status: LikeStatus.PENDING,
          deletedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      if (!reverseLike) {
        this.logger.debug(
          `No reverse like found for users ${userAId} and ${userBId}.`,
        );
        return;
      }

      this.logger.log(
        `Reverse like found: ${reverseLike.id} for new like: ${newLike.id}.`,
      );

      // 3. Verify intent compatibility
      if (
        !this.matchService.isIntentCompatible(
          newLike.intent,
          reverseLike.intent,
        )
      ) {
        this.logger.log(
          `Intents are incompatible between Like ${newLike.id} (${newLike.intent}) and Like ${reverseLike.id} (${reverseLike.intent}).`,
        );
        return;
      }

      // 4. Verify no block exists
      const isBlocked = await this.blockService.isBlocked(userAId, userBId);
      if (isBlocked) {
        this.logger.log(
          `Block exists between users ${userAId} and ${userBId}. Suppressing match.`,
        );
        return;
      }

      // 5. Canonical User Ordering
      const [userOneId, userTwoId] = [userAId, userBId].sort();

      // Ensure we map the correct like ID to the canonically ordered users
      const canonicalLikeOne = userOneId === userAId ? newLike : reverseLike;
      const canonicalLikeTwo = userTwoId === userBId ? reverseLike : newLike;

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
        this.logger.warn(
          `Active match already exists between ${userOneId} and ${userTwoId}. Duplicate prevented.`,
        );
        return;
      }

      // 7. Atomic Transaction to create Match and update both Likes
      await this.prisma.$transaction(async (tx) => {
        if (existingMatch) {
          // Reactivate the match if it was UNMATCHED previously
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
          where: { id: newLike.id },
          data: { status: LikeStatus.MATCHED },
        });

        await tx.like.update({
          where: { id: reverseLike.id },
          data: { status: LikeStatus.MATCHED },
        });
      });

      this.logger.log(
        `Match created successfully between users ${userOneId} and ${userTwoId}.`,
      );
    } catch (error) {
      if (error?.code === 'P2002') {
        // Unique constraint violation
        this.logger.warn(
          `Race condition caught: Unique constraint violation while creating Match for users ${newLike.senderUserId} and ${newLike.targetUserId}.`,
        );
        return; // Absorb safely
      }

      this.logger.error(
        `Failed to resolve match for Like ${newLike.id}`,
        error.stack,
      );
    }
  }
}
