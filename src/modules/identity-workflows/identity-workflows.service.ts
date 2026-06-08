import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { IdentitiesService } from '@modules/identities/identities.service';
import {
  LikeSummary,
  MatchResolverService,
} from '@modules/match-resolver/match-resolver.service';
import { NotificationCategory } from '@modules/notifications/enums/notification-category.enum';
import { NotificationChannel } from '@modules/notifications/enums/notification-channel.enum';
import { NotificationPriority } from '@modules/notifications/enums/notification-priority.enum';
import { NotificationType } from '@modules/notifications/enums/notification-type.enum';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { OneTimePasswordsService } from '@modules/one-time-passwords/one-time-passwords.service';
import { PubSubEvent } from '@modules/pubsub/enums';
import { PubSubListener } from '@modules/pubsub/pubsub.decorator';
import { SocialidentitiesService } from '@modules/social-identities/social-identities.service';
import { Injectable } from '@nestjs/common';
import { IdentityType, LikeStatus } from '@prisma/client';

@Injectable()
export class IdentityWorkflowsService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly oneTimePasswordsService: OneTimePasswordsService,
    private readonly socialidentitiesService: SocialidentitiesService,
    private readonly identitiesService: IdentitiesService,
    private readonly notificationsService: NotificationsService,
    private readonly matchResolverService: MatchResolverService,
  ) {
    super(logger);
  }

  @PubSubListener(PubSubEvent.INSTAGRAM_OTP_RECEIVED)
  async handleInstagramOtpReceived(
    data: { otp: string; senderId: string; timestamp: string },
    messageId: string,
  ): Promise<void> {
    this.logger.info(`Received Instagram OTP event for messageId ${messageId}`);

    const { otp: extractedOtp, senderId } = data;

    try {
      this.logger.log(`OTP extracted: ${extractedOtp}. Verifying...`);
      // Note: verifyAndConsumeOtp automatically handles hashing the OTP
      const userId =
        await this.oneTimePasswordsService.verifyAndConsumeOtp(extractedOtp);

      this.logger.log(
        `OTP verified successfully for userId: ${userId}. Fetching identity for senderId: ${senderId}`,
      );
      const identity =
        await this.socialidentitiesService.verifyInstagramIdentity(
          userId,
          senderId,
        );

      const username = identity.username;

      if (username) {
        this.logger.log(
          `Found Instagram username: ${username}. Linking identity to user ${userId}...`,
        );
        await this.identitiesService.claimOrCreateIdentity(
          IdentityType.INSTAGRAM,
          username,
          senderId,
          userId,
        );
        this.logger.log(
          `Successfully linked Instagram identity (${username}) to user (${userId}).`,
        );

        // TODO: take the next steps
        this.notificationsService
          .dispatch({
            userIds: [userId],
            channels: [NotificationChannel.PUSH],
            title: 'Identity Claimed',
            body: `Your Instagram identity (${username}) has been successfully linked to your account.`,
            type: NotificationType.SYSTEM_ALERT,
            category: NotificationCategory.SYSTEM,
            priority: NotificationPriority.HIGH,
          })
          .catch((err) => {
            this.logger.error(
              `Failed to dispatch identity claimed notification for user ${userId}`,
              { error: err instanceof Error ? err.message : String(err) },
            );
          });
      } else {
        this.logger.warn(
          `Could not extract a valid username from Instagram identity payload.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error during OTP verification flow for sender ${senderId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handles the `identity.claimed` Pub/Sub event.
   *
   * Orchestrates two independent passes:
   *   1. Backfill — data integrity: stamp targetUserId on ALL historically
   *      unresolved likes (regardless of expiry or deletion state).
   *   2. Match resolution — business logic: evaluate only still-actionable likes
   *      for mutual-like / match creation.
   *
   * Keeping these two concerns separate ensures a pod crash or early return in
   * resolution never silently skips the backfill.
   */
  @PubSubListener(PubSubEvent.IDENTITY_CLAIMED)
  async handleIdentityClaimed(
    data: { userId: string },
    messageId: string,
  ): Promise<void> {
    const { userId } = data;
    this.logger.info(
      `[${messageId}] Processing identity.claimed for user ${userId}`,
    );

    const userIdentities = await this.prisma.identity.findMany({
      where: { userId, deletedAt: null },
      select: { id: true },
    });

    if (userIdentities.length === 0) {
      this.logger.debug(
        `[${messageId}] No active identities found for user ${userId}. Skipping.`,
      );
      return;
    }

    const identityIds = userIdentities.map((i) => i.id);

    // Pass 1: unconditional data-integrity backfill.
    await this.backfillTargetUserId(userId, identityIds, messageId);

    // Pass 2: match resolution on only the still-actionable likes.
    await this.resolveUnclaimedLikes(userId, identityIds, messageId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Backfills `targetUserId` on every like that ever pointed at one of the
   * claiming user's identities while it was unclaimed — regardless of whether
   * the like has since expired, been soft-deleted, or changed status.
   *
   * This is a pure data-integrity operation so that historical queries
   * (analytics, audits, future reprocessing) always find the correct owner.
   */
  private async backfillTargetUserId(
    userId: string,
    identityIds: string[],
    messageId: string,
  ): Promise<void> {
    const result = await this.prisma.like.updateMany({
      where: {
        targetIdentityId: { in: identityIds },
        targetUserId: null,
      },
      data: { targetUserId: userId },
    });

    this.logger.log(
      `[${messageId}] Backfilled targetUserId=${userId} on ${result.count} like(s) (all statuses/expiry states).`,
    );
  }

  /**
   * Runs match resolution against every like that is still actionable:
   * `PENDING`, not soft-deleted, and not yet expired.
   *
   * By the time this runs, `targetUserId` has already been backfilled by
   * `backfillTargetUserId`, so `resolveFromLike` receives a fully resolved like.
   */
  private async resolveUnclaimedLikes(
    userId: string,
    identityIds: string[],
    messageId: string,
  ): Promise<void> {
    const actionableLikes = await this.prisma.like.findMany({
      where: {
        targetIdentityId: { in: identityIds },
        targetUserId: userId,
        status: LikeStatus.PENDING,
        deletedAt: null,
        expiresAt: { gt: DateUtil.now() },
      },
      select: {
        id: true,
        senderUserId: true,
        targetUserId: true,
        intent: true,
        status: true,
      },
    });

    if (actionableLikes.length === 0) {
      this.logger.debug(
        `[${messageId}] No actionable likes to resolve for user ${userId}.`,
      );
      return;
    }

    this.logger.log(
      `[${messageId}] Running match resolution for ${actionableLikes.length} actionable like(s) targeting user ${userId}.`,
    );

    // resolveFromLike is already idempotent: it suppresses P2002 race conditions,
    // validates intent compatibility, and checks blocks internally.
    await Promise.allSettled(
      actionableLikes.map((like) =>
        this.matchResolverService
          .resolveFromLike(like as LikeSummary)
          .catch((err: Error) => {
            this.logger.error(
              `[${messageId}] resolveFromLike failed for Like ${like.id}`,
              { error: err.message },
            );
          }),
      ),
    );

    this.logger.log(
      `[${messageId}] Match resolution complete for user ${userId}.`,
    );
  }
}
