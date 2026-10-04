import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreditTransactionType } from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { CreditsService } from '@modules/credits/credits.service';
import { PubSubEvent } from '@modules/pubsub/enums/pubsub-events.enum';
import { PubSubTopic } from '@modules/pubsub/enums/pubsub-topics.enum';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { SubscriptionsService } from '@modules/subscriptions/services/subscriptions.service';

/** Number of users processed per Pub/Sub batch message. Tunable via env. */
const DEFAULT_EXPIRY_BATCH_SIZE = 100;

/** Default retention period in days for expired user sessions before purging. */
const DEFAULT_USER_SESSION_RETENTION_DAYS = 7;

/** Maximum number of expired session rows deleted per chunk to prevent long-running table locks. */
const DEFAULT_USER_SESSION_CLEANUP_BATCH_SIZE = 5000;

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
  private readonly sessionCleanupBatchSize: number;
  private readonly sessionRetentionDays: number;

  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly creditsService: CreditsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly pubSubPublisher: PubSubPublisherService,
    private readonly configService: ConfigService,
  ) {
    super(logger);
    this.expiryBatchSize =
      this.configService.get<number>('CREDIT_EXPIRY_BATCH_SIZE') ??
      DEFAULT_EXPIRY_BATCH_SIZE;
    this.sessionCleanupBatchSize =
      this.configService.get<number>('USER_SESSION_CLEANUP_BATCH_SIZE') ??
      DEFAULT_USER_SESSION_CLEANUP_BATCH_SIZE;
    this.sessionRetentionDays =
      this.configService.get<number>('USER_SESSION_RETENTION_DAYS') ??
      DEFAULT_USER_SESSION_RETENTION_DAYS;
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
    const ctx = { batchSize: this.expiryBatchSize, asOf };

    let cursor: string | undefined = undefined;
    let batchesPublished = 0;
    let totalUsersEnqueued = 0;
    let hasMore = true;

    this.logger.log('Credit expiry fan-out started', {
      ...ctx,
      step: 'init',
    });

    try {
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

        this.logger.debug('Published credit expiry batch', {
          ...ctx,
          step: 'publish_batch',
          batchNumber: batchesPublished,
          userCount: userIds.length,
          cursor,
        });

        // If we fetched fewer rows than the requested batch size, we've reached the end.
        if (rows.length < this.expiryBatchSize) {
          hasMore = false;
        }
      }

      this.logger.log('Credit expiry fan-out completed', {
        ...ctx,
        step: 'complete',
        batchesPublished,
        totalUsersEnqueued,
      });

      return { batchesPublished, totalUsersEnqueued };
    } catch (error) {
      this.logger.error('Credit expiry fan-out failed', {
        ...ctx,
        step: 'fan_out',
        err: serializeError(error),
      });
      throw error;
    }
  }

  async expireSubscriptions() {
    this.logger.log('Subscription expiry job started', {
      step: 'init',
    });

    try {
      const result = await this.subscriptionsService.expireSubscriptions();

      this.logger.log('Subscription expiry job completed', {
        step: 'complete',
      });

      return result;
    } catch (error) {
      this.logger.error('Subscription expiry job failed', {
        step: 'expire_subscriptions',
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Fan-out coordinator for the bundle expiry warning job.
   *
   * Queries the `CreditLedger` for bundles expiring in exactly 7 days
   * (between `now + 6 days` and `now + 7 days`). Since this job is expected
   * to run daily, each bundle falls into this 24-hour window exactly once,
   * avoiding duplicate notifications without schema changes.
   *
   * @returns `{ batchesPublished, totalUsersEnqueued }`
   */
  async warnExpiringCreditBundles(): Promise<{
    batchesPublished: number;
    totalUsersEnqueued: number;
  }> {
    const asOf = DateUtil.now();

    // Target window: bundles expiring between (asOf + 6 days) and (asOf + 7 days)
    const targetStart = DateUtil.addDays(asOf, 6);
    const targetEnd = DateUtil.addDays(asOf, 7);

    const ctx = {
      batchSize: this.expiryBatchSize,
      windowStart: targetStart.toISOString(),
      windowEnd: targetEnd.toISOString(),
    };

    let cursor: string | undefined = undefined;
    let batchesPublished = 0;
    let totalUsersEnqueued = 0;
    let hasMore = true;

    this.logger.log('Credit expiry warning fan-out started', {
      ...ctx,
      step: 'init',
    });

    try {
      while (hasMore) {
        const rows: Array<{ userId: string }> =
          await this.prisma.creditLedger.findMany({
            where: {
              transactionType: CreditTransactionType.CREDIT,
              expiresAt: {
                gte: targetStart,
                lt: targetEnd,
              },
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
          PubSubEvent.CREDIT_EXPIRY_WARNING_BATCH,
          { userIds, asOf: asOf.toISOString() },
        );

        cursor = userIds[userIds.length - 1];
        batchesPublished++;
        totalUsersEnqueued += userIds.length;

        this.logger.debug('Published credit expiry warning batch', {
          ...ctx,
          step: 'publish_batch',
          batchNumber: batchesPublished,
          userCount: userIds.length,
          cursor,
        });

        if (rows.length < this.expiryBatchSize) {
          hasMore = false;
        }
      }

      this.logger.log('Credit expiry warning fan-out completed', {
        ...ctx,
        step: 'complete',
        batchesPublished,
        totalUsersEnqueued,
      });

      return { batchesPublished, totalUsersEnqueued };
    } catch (error) {
      this.logger.error('Credit expiry warning fan-out failed', {
        ...ctx,
        step: 'fan_out',
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Purges expired and stale user session records older than the retention threshold.
   *
   * Executes chunked deletion using index-optimized lookups (`expiresAt < cutoffDate`)
   * to prevent database lock contention and memory exhaustion on high-volume tables.
   *
   * @param retentionDays - Optional custom retention period in days (defaults to 7 days).
   * @returns Summary of purged records and the cutoff timestamp.
   */
  async purgeExpiredUserSessions(
    retentionDays?: number,
  ): Promise<{ deletedCount: number; cutoffDate: string }> {
    const daysToRetain = retentionDays ?? this.sessionRetentionDays;
    const cutoffDate = DateUtil.subtractDays(DateUtil.now(), daysToRetain);
    const ctx = {
      step: 'init',
      retentionDays: daysToRetain,
      cutoffDate: cutoffDate.toISOString(),
      batchSize: this.sessionCleanupBatchSize,
    };

    let totalDeleted = 0;
    let iteration = 0;
    let hasMore = true;

    this.logger.log('User session retention cleanup started', ctx);

    try {
      while (hasMore) {
        iteration++;
        const expiredSessions = await this.prisma.userSession.findMany({
          where: { expiresAt: { lt: cutoffDate } },
          select: { id: true },
          take: this.sessionCleanupBatchSize,
        });

        if (expiredSessions.length === 0) {
          hasMore = false;
          break;
        }

        const ids = expiredSessions.map((session) => session.id);
        const deleteResult = await this.prisma.userSession.deleteMany({
          where: { id: { in: ids } },
        });

        totalDeleted += deleteResult.count;

        this.logger.debug('Purged chunk of expired user sessions', {
          step: 'batch_deleted',
          iteration,
          batchCount: deleteResult.count,
          totalDeletedSoFar: totalDeleted,
        });

        if (expiredSessions.length < this.sessionCleanupBatchSize) {
          hasMore = false;
        }
      }

      this.logger.log('User session retention cleanup completed', {
        step: 'complete',
        totalDeleted,
        iterations: iteration,
        cutoffDate: cutoffDate.toISOString(),
      });

      return {
        deletedCount: totalDeleted,
        cutoffDate: cutoffDate.toISOString(),
      };
    } catch (error) {
      this.logger.error('User session retention cleanup failed', {
        step: 'purge_sessions',
        err: serializeError(error),
      });
      throw error;
    }
  }
}
