import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { CreditsService } from '@modules/credits/credits.service';
import { Injectable } from '@nestjs/common';
import { LikeStatus } from '@prisma/client';

@Injectable()
export class MaintenanceService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly creditsService: CreditsService,
  ) {
    super(logger);
  }

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

  async expireCreditBundles() {
    return this.creditsService.expireCreditBundles();
  }
}
