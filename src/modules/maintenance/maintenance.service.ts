import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { CreditsService } from '@modules/credits/credits.service';
import { Injectable } from '@nestjs/common';
import { LikeStatus } from '@prisma/client';

/**
 * Implements scheduled data-hygiene operations that keep the database clean
 * and consistent with business rules that cannot be enforced at write time.
 *
 * Methods in this service are designed to be idempotent: running them multiple
 * times in the same window produces the same result without double-processing.
 */
@Injectable()
export class MaintenanceService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly creditsService: CreditsService,
  ) {
    super(logger);
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
   * Delegates credit-bundle expiration to `CreditsService`, keeping the
   * expiry business logic co-located with the credits domain.
   *
   * @returns The result object from `CreditsService.expireCreditBundles`.
   */
  async expireCreditBundles() {
    return this.creditsService.expireCreditBundles();
  }
}
