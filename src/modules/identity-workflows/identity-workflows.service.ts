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

/**
 * Reacts to identity-related Pub/Sub events and executes the multi-step workflows
 * that verify, link, and resolve matches for user identities.
 *
 * All entry points are Pub/Sub listeners — there are no direct service-to-service
 * calls into this class. The two primary flows are:
 *   1. Instagram OTP verification: validates an OTP received via DM, links the
 *      sender's Instagram account to the BreathAway user, and fires a push notification.
 *   2. Identity claimed: after any identity is claimed, retroactively resolves all
 *      pending likes that targeted the newly owned identity, completing deferred matches.
 */
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

  /**
   * Processes an Instagram OTP received via DM to verify and claim the sender's
   * Instagram identity on behalf of the BreathAway user who initiated the flow.
   *
   * Sequence: verifies and consumes the OTP → resolves the Instagram sender to a
   * social identity record → claims or creates a canonical Identity → fires a
   * push notification to confirm linkage. Notification failures are swallowed so
   * they do not invalidate the successful claim.
   *
   * @param data - Event payload containing the extracted OTP, Instagram sender ID,
   *               and the message timestamp.
   * @param messageId - Pub/Sub message ID used for tracing across log entries.
   */
  @PubSubListener(PubSubEvent.INSTAGRAM_OTP_RECEIVED)
  async handleInstagramOtpReceived(
    data: { otp: string; senderId: string; timestamp: string },
    messageId: string,
  ): Promise<void> {
    this.logger.info(`Received Instagram OTP event for messageId ${messageId}`);

    const { otp: extractedOtp, senderId } = data;

    try {
      this.logger.debug(`OTP extracted: ${extractedOtp}. Verifying...`);
      // Note: verifyAndConsumeOtp automatically handles hashing the OTP
      const userId =
        await this.oneTimePasswordsService.verifyAndConsumeOtp(extractedOtp);

      this.logger.debug(
        `OTP verified successfully for userId: ${userId}. Fetching identity for senderId: ${senderId}`,
      );
      const identity =
        await this.socialidentitiesService.verifyInstagramIdentity(
          userId,
          senderId,
        );

      const username = identity.username;

      if (username) {
        this.logger.debug(
          `Found Instagram username: ${username}. Linking identity to user ${userId}`,
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
   * Finds all still-actionable likes that targeted one of the newly-owned
   * identities and attempts match resolution for each. Ownership is resolved
   * at query time via the live `Identity → userId` join, so no data migration
   * is required before match processing can begin.
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

    await this.resolveUnclaimedLikes(userId, identityIds, messageId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Runs match resolution against every like that is still actionable:
   * `PENDING`, not soft-deleted, and not yet expired.
   *
   * The filter on `targetIdentityId` is sufficient to scope results to the
   * claiming user — no `targetUserId` filter is needed because that column
   * no longer exists.
   */
  private async resolveUnclaimedLikes(
    userId: string,
    identityIds: string[],
    messageId: string,
  ): Promise<void> {
    const actionableLikes = await this.prisma.like.findMany({
      where: {
        targetIdentityId: { in: identityIds },
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

    if (actionableLikes.length === 0) {
      this.logger.debug(
        `[${messageId}] No actionable likes to resolve for user ${userId}.`,
      );
      return;
    }

    this.logger.debug(
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
