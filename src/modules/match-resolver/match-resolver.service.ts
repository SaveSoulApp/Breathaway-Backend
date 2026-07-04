import { Injectable } from '@nestjs/common';
import { Like, LikeStatus, Match, MatchStatus } from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';
import { BlocksService } from '@modules/blocks/blocks.service';
import { MatchesService } from '@modules/matches/matches.service';
import { NotificationCategory } from '@modules/notifications/enums/notification-category.enum';
import { NotificationChannel } from '@modules/notifications/enums/notification-channel.enum';
import { NotificationType } from '@modules/notifications/enums/notification-type.enum';
import { NotificationsService } from '@modules/notifications/notifications.service';

/**
 * Minimal like shape consumed by the match resolver.
 * `targetIdentity.userId` replaces the removed `targetUserId` denormalized
 * column — the live join through `Identity` is always authoritative.
 */
export type LikeSummary = Pick<
  Like,
  'id' | 'senderUserId' | 'targetIdentityId' | 'intent' | 'status'
> & {
  targetIdentity: { userId: string | null };
};

@Injectable()
/**
 * Orchestrates the match resolution pipeline that runs synchronously after a
 * new like is persisted.
 *
 * The resolution sequence is: verify the target identity is resolved → find a
 * reverse like → validate intent compatibility and block status → execute the
 * match upsert inside a Prisma transaction. Prisma's `P2002` unique constraint
 * violation is caught and silenced as a harmless race condition (two concurrent
 * likes resolving simultaneously), ensuring idempotent behaviour at scale.
 */
export class MatchResolverService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly matchesService: MatchesService,
    private readonly blocksService: BlocksService,
    private readonly notificationsService: NotificationsService,
  ) {
    super(logger);
  }

  /**
   * Entry point for the match resolution pipeline, called immediately after a
   * like record is created.
   *
   * Uses deterministic user-ID sorting to assign canonical `userOne`/`userTwo`
   * roles, ensuring the unique constraint on `(userOneId, userTwoId)` is always
   * applied consistently regardless of which user liked first. A Prisma `P2002`
   * error (unique constraint violation) is silently swallowed as a resolved race
   * condition — any other error is logged and suppressed so a failed match
   * resolution does not roll back the like itself.
   *
   * @param newLike - The newly created like summary triggering resolution.
   */
  async resolveFromLike(newLike: LikeSummary) {
    const ctx = {
      likeId: newLike.id,
      senderUserId: newLike.senderUserId,
      targetIdentityId: newLike.targetIdentityId,
    };
    this.logger.debug('Match resolution started', { ...ctx, step: 'init' });

    try {
      const targetUserId = newLike.targetIdentity.userId;

      if (!targetUserId) {
        this.logger.debug(
          'Target identity unresolved — skipping match resolution',
          {
            ...ctx,
            step: 'identity_check',
          },
        );
        return;
      }

      Object.assign(ctx, { targetUserId });

      const reverseLike = await this.findReverseLike(
        newLike.senderUserId,
        targetUserId,
      );

      if (!reverseLike) {
        this.logger.debug('No reverse like found — no match', {
          ...ctx,
          step: 'reverse_like_lookup',
        });
        return;
      }
      this.logger.debug('Reverse like found', {
        ...ctx,
        step: 'reverse_like_lookup',
        reverseLikeId: reverseLike.id,
      });

      const [userOneId, userTwoId] = [
        newLike.senderUserId,
        targetUserId,
      ].sort();

      const canonicalLikeOne =
        userOneId === newLike.senderUserId ? newLike : reverseLike;
      const canonicalLikeTwo =
        userTwoId === targetUserId ? reverseLike : newLike;

      const isEligible = await this.validateMatchEligibility(
        newLike,
        reverseLike,
        targetUserId,
        userOneId,
        userTwoId,
      );

      if (!isEligible.valid) return;

      const match = await this.executeMatchTransaction(
        canonicalLikeOne,
        canonicalLikeTwo,
        userOneId,
        userTwoId,
        isEligible.existingMatch,
      );

      this.logger.log('Match resolved successfully', {
        ...ctx,
        step: 'complete',
        matchId: match.id,
        userOneId,
        userTwoId,
        reactivated: isEligible.existingMatch !== null,
      });

      this.emitAuditLog({
        actionType: AuditActionType.MATCH_RESOLVED,
        userId: newLike.senderUserId,
        resourceId: match.id,
        metadata: {
          matchId: match.id,
          secondaryUserId: targetUserId,
        },
      });

      // Dispatch notifications fire-and-forget; errors are caught and logged inside
      await this.dispatchMatchNotifications(userOneId, userTwoId, match.id);
    } catch (err) {
      const serialized = serializeError(err);

      // P2002 = unique constraint violation — two concurrent likes resolved
      // simultaneously. Harmless race condition: one of them already created the
      // match. Swallow silently after a warn so it's still queryable.
      if ((err as { code?: string }).code === 'P2002') {
        this.logger.warn(
          'Race condition: match already created by concurrent resolution',
          {
            ...ctx,
            step: 'complete',
            err: serialized,
          },
        );
        return;
      }

      this.logger.error('Match resolution failed', {
        ...ctx,
        step: 'complete',
        err: serialized,
      });
    }
  }

  /**
   * Fetches user profiles and dispatches localized NEW_MATCH notifications to both users.
   */
  private async dispatchMatchNotifications(
    userOneId: string,
    userTwoId: string,
    matchId: string,
  ): Promise<void> {
    const ctx = { matchId, userOneId, userTwoId };
    this.logger.debug('Dispatching match notifications', {
      ...ctx,
      step: 'notify_init',
    });

    try {
      const profiles = await this.prisma.userProfile.findMany({
        where: { userId: { in: [userOneId, userTwoId] } },
        select: { userId: true, firstName: true },
      });

      // First names are used only for notification payload copy — not logged (PII).
      const userOneName =
        profiles.find((p) => p.userId === userOneId)?.firstName ?? 'someone';
      const userTwoName =
        profiles.find((p) => p.userId === userTwoId)?.firstName ?? 'someone';

      // Notify User One
      await this.notificationsService.dispatch({
        channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL],
        userIds: [userOneId],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        payload: { name: userTwoName, matchId },
      });
      this.logger.debug('Notification dispatched to userOne', {
        ...ctx,
        step: 'notify_dispatch',
      });

      // Notify User Two
      await this.notificationsService.dispatch({
        channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL],
        userIds: [userTwoId],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        payload: { name: userOneName, matchId },
      });
      this.logger.debug('Notification dispatched to userTwo', {
        ...ctx,
        step: 'notify_dispatch',
      });
    } catch (err) {
      // Notification failure must not surface to the caller — the match is
      // already persisted. Log and continue.
      this.logger.error('Failed to dispatch match notifications', {
        ...ctx,
        step: 'notify_dispatch',
        err: serializeError(err),
      });
    }
  }

  /**
   * Searches for a PENDING, non-expired like from `userBId` targeting `userAId`.
   *
   * @param userAId - The sender of the new like whose perspective we are checking from.
   * @param userBId - The target of the new like, who must have previously liked back.
   * @returns The reverse `LikeSummary` if found, or `null` when no mutual like exists.
   */
  private async findReverseLike(
    userAId: string,
    userBId: string,
  ): Promise<LikeSummary | null> {
    return this.prisma.like.findFirst({
      where: {
        senderUserId: userBId,
        targetIdentity: { userId: userAId },
        status: LikeStatus.PENDING,
        deletedAt: null,
        expiresAt: { gt: DateUtil.now() },
      },
      select: {
        id: true,
        senderUserId: true,
        targetIdentityId: true,
        intent: true,
        status: true,
        targetIdentity: { select: { userId: true } },
      },
    });
  }

  /**
   * Runs three eligibility checks before allowing a match to be created:
   * 1. Intent compatibility between the two likes.
   * 2. No active block relationship between the users.
   * 3. No currently ACTIVE match already exists for the user pair.
   *
   * An existing UNMATCHED record is considered eligible for reactivation and
   * is returned as `existingMatch` so the transaction can upsert rather than
   * insert.
   *
   * @returns `{ valid: true, existingMatch }` when all checks pass; `{ valid: false, existingMatch: null }` otherwise.
   */
  private async validateMatchEligibility(
    newLike: LikeSummary,
    reverseLike: LikeSummary,
    targetUserId: string,
    userOneId: string,
    userTwoId: string,
  ): Promise<{ valid: boolean; existingMatch: Match | null }> {
    const ctx = {
      likeId: newLike.id,
      reverseLikeId: reverseLike.id,
      userOneId,
      userTwoId,
    };

    if (
      !this.matchesService.isIntentCompatible(
        newLike.intent,
        reverseLike.intent,
      )
    ) {
      this.logger.debug('Intents incompatible — match suppressed', {
        ...ctx,
        step: 'intent_check',
        intentOne: newLike.intent,
        intentTwo: reverseLike.intent,
      });
      return { valid: false, existingMatch: null };
    }
    this.logger.debug('Intent check passed', { ...ctx, step: 'intent_check' });

    const isBlocked = await this.blocksService.isBlocked(
      newLike.senderUserId,
      targetUserId,
    );

    if (isBlocked) {
      this.logger.debug('Block exists — match suppressed', {
        ...ctx,
        step: 'block_check',
      });
      return { valid: false, existingMatch: null };
    }
    this.logger.debug('Block check passed', { ...ctx, step: 'block_check' });

    const existingMatch = await this.prisma.match.findUnique({
      where: { userOneId_userTwoId: { userOneId, userTwoId } },
    });

    if (existingMatch && existingMatch.status === MatchStatus.ACTIVE) {
      this.logger.warn('Active match already exists — duplicate prevented', {
        ...ctx,
        step: 'duplicate_check',
        existingMatchId: existingMatch.id,
      });
      return { valid: false, existingMatch: null };
    }
    this.logger.debug('Eligibility checks passed', {
      ...ctx,
      step: 'duplicate_check',
      willReactivate: existingMatch !== null,
    });

    return { valid: true, existingMatch };
  }

  /**
   * Atomically creates or reactivates a match and marks both triggering likes
   * as MATCHED within a single Prisma transaction.
   *
   * When `existingMatch` is non-null (a previously UNMATCHED record), the
   * transaction performs an update to re-activate it with updated like
   * references and a fresh `matchedAt` timestamp. Otherwise a new match record
   * is created. Both paths mark the two likes as MATCHED in the same
   * transaction to prevent partial updates.
   *
   * @param likeOne       - The like associated with `userOneId` (canonical order).
   * @param likeTwo       - The like associated with `userTwoId` (canonical order).
   * @param userOneId     - Lower-sorted user ID (deterministic canonical order).
   * @param userTwoId     - Higher-sorted user ID.
   * @param existingMatch - An existing, non-active match record to reactivate,
   *                        or `null` to create a new one.
   * @returns The persisted (created or updated) Match record.
   */
  private async executeMatchTransaction(
    likeOne: LikeSummary,
    likeTwo: LikeSummary,
    userOneId: string,
    userTwoId: string,
    existingMatch: Match | null,
  ): Promise<Match> {
    const ctx = {
      likeOneId: likeOne.id,
      likeTwoId: likeTwo.id,
      userOneId,
      userTwoId,
    };
    const isReactivation = existingMatch !== null;
    this.logger.debug('Match transaction started', {
      ...ctx,
      step: 'match_transaction',
      isReactivation,
    });

    // No try/catch here — P2002 and infra failures propagate to resolveFromLike's
    // outer catch, which handles P2002 as a silent race condition and logs errors
    // with full ctx for all other failures.
    return this.prisma.$transaction(async (tx) => {
      let finalMatch: Match;

      if (existingMatch) {
        finalMatch = await tx.match.update({
          where: { id: existingMatch.id },
          data: {
            likeOneId: likeOne.id,
            likeTwoId: likeTwo.id,
            intentOne: likeOne.intent,
            intentTwo: likeTwo.intent,
            status: MatchStatus.ACTIVE,
            deletedAt: null,
            matchedAt: DateUtil.now(),
          },
        });
        this.logger.debug('Existing match reactivated', {
          ...ctx,
          step: 'match_transaction',
          matchId: finalMatch.id,
        });
      } else {
        finalMatch = await tx.match.create({
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
        this.logger.debug('New match record created', {
          ...ctx,
          step: 'match_transaction',
          matchId: finalMatch.id,
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
      this.logger.debug('Both likes marked MATCHED', {
        ...ctx,
        step: 'match_transaction',
      });

      return finalMatch;
    });
  }
}
