import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { PubSubEvent } from '@modules/pubsub/enums/pubsub-events.enum';
import { PubSubTopic } from '@modules/pubsub/enums/pubsub-topics.enum';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreditTransactionType, LikeStatus } from '@prisma/client';

/** Number of users processed per Pub/Sub batch message. Tunable via env. */
const DEFAULT_EXPIRY_BATCH_SIZE = 100;

/**
 * Implements scheduled data-hygiene operations that keep the database clean
 * and consistent with business rules that cannot be enforced at write time.
 *
 * Methods in this service are designed to be idempotent: running them multiple
 * times in the same window produces the same result without double-processing.
 */
@Injectable()
export class MaintenanceService extends BaseService {
  private readonly expiryBatchSize: number;

  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly pubSubPublisher: PubSubPublisherService,
    private readonly configService: ConfigService,
  ) {
    super(logger);
    this.expiryBatchSize =
      this.configService.get<number>('CREDIT_EXPIRY_BATCH_SIZE') ??
      DEFAULT_EXPIRY_BATCH_SIZE;
  }

  /**
   * Bulk-voids all PENDING likes whose `createdAt` timestamp is older than
   * 90 days, preventing long-dormant swipes from triggering a match if the
   * target user returns to the platform much later.
   *
   * Uses `updateMany` for a single-query bulk update rather than fetching
   * records individually. Voided likes are retained for audit purposes.
   *
   * @returns `{ voidedCount: number }` — the number of likes updated.
   */
  async voidPendingLikes() {
    const ninetyDaysAgo = DateUtil.dayjs().subtract(90, 'days').toDate();

    const result = await this.prisma.like.updateMany({
      where: {
        status: LikeStatus.PENDING,
        createdAt: { lte: ninetyDaysAgo },
      },
      data: {
        status: LikeStatus.VOIDED,
      },
    });

    this.logger.log(
      `Expiration job complete. Voided ${result.count} pending likes older than 90 days.`,
    );

    return { voidedCount: result.count };
  }

  /**
   * Fan-out coordinator for the credit-bundle expiry job.
   *
   * Rather than processing all users in a single synchronous loop (which
   * would exhaust memory and DB connections at scale), this method:
   *
   * 1. Pins a single `asOf` timestamp so all batches evaluate expiry at the
   *    same point in time, regardless of Pub/Sub delivery lag.
   * 2. Cursor-paginates through distinct user IDs with expired CREDIT rows
   *    using a stable `userId` cursor — no unbounded `findMany` into heap.
   * 3. Publishes one `credit.expiry.batch` Pub/Sub message per page of users
   *    to the `credit-expiry` topic. The actual expiration logic runs
   *    asynchronously in `CreditsService.handleExpiryBatch` via push delivery.
   * 4. Returns immediately after all batch messages are published, keeping the
   *    Cloud Scheduler HTTP request well within its timeout window.
   *
   * @returns `{ batchesPublished, totalUsersEnqueued }` — a lightweight summary
   *   useful for Cloud Logging and monitoring dashboards.
   */
  async expireCreditBundles(): Promise<{
    batchesPublished: number;
    totalUsersEnqueued: number;
  }> {
    // Pin now once so every batch worker expires credits at the same instant.
    const asOf = DateUtil.now().toISOString();

    let cursor: string | undefined = undefined;
    let batchesPublished = 0;
    let totalUsersEnqueued = 0;
    let hasMore = true;

    this.logger.log(
      `Credit expiry fan-out started. batchSize=${this.expiryBatchSize}, asOf=${asOf}`,
    );

    while (hasMore) {
      // Cursor-paginate distinct userIds with expired CREDIT rows.
      // `cursor` advances to the last userId of the previous page, ensuring
      // we never re-fetch the same page and hold no result set in memory.
      const rows: Array<{ userId: string }> =
        await this.prisma.creditLedger.findMany({
          where: {
            transactionType: CreditTransactionType.CREDIT,
            expiresAt: { lte: new Date(asOf) },
            ...(cursor ? { userId: { gt: cursor } } : {}),
          },
          select: { userId: true },
          distinct: ['userId'],
          orderBy: { userId: 'asc' },
          take: this.expiryBatchSize,
        });

      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      const userIds: string[] = rows.map((r) => r.userId);

      await this.pubSubPublisher.publish(
        PubSubTopic.CREDIT_EXPIRY,
        PubSubEvent.CREDIT_EXPIRY_BATCH,
        { userIds, asOf },
      );

      cursor = userIds[userIds.length - 1];
      batchesPublished++;
      totalUsersEnqueued += userIds.length;

      this.logger.debug(
        `Published batch #${batchesPublished} with ${userIds.length} users (cursor=${cursor})`,
      );

      // If we fetched fewer rows than the requested batch size, we've reached the end.
      if (rows.length < this.expiryBatchSize) {
        hasMore = false;
      }
    }

    this.logger.log(
      `Credit expiry fan-out complete. Published ${batchesPublished} batches, enqueued ${totalUsersEnqueued} users.`,
    );

    return { batchesPublished, totalUsersEnqueued };
  }
}
