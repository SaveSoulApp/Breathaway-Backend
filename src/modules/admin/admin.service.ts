import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { Injectable } from '@nestjs/common';
import {
  CreditSource,
  CreditTransactionType,
  DevicePlatform,
  GenderType,
  IdentityType,
  IntentType,
  Prisma,
} from '@prisma/client';
import { GetReportRequestDto, ReportResponseDto } from './dto';

@Injectable()
export class AdminService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  async generateReport(query: GetReportRequestDto): Promise<ReportResponseDto> {
    const { startDate, endDate } = query;

    const timeframeFilter: Prisma.DateTimeFilter = {};
    if (startDate || endDate) {
      const gte = startDate || undefined;
      const lte = endDate || undefined;
      // We'll apply this selectively to different entities below
      Object.assign(timeframeFilter, {
        ...(gte && { gte }),
        ...(lte && { lte }),
      });
    }

    const hasTimeframe = Object.keys(timeframeFilter).length > 0;

    // Users
    const totalUsers = await this.prisma.user.count({
      where: { deletedAt: null },
    });

    let acquiredInTimeframe = totalUsers;
    if (hasTimeframe) {
      acquiredInTimeframe = await this.prisma.user.count({
        where: {
          deletedAt: null,
          createdAt: timeframeFilter,
        },
      });
    }

    const completedProfiles = await this.prisma.userProfile.count();

    const demographicsGroup = await this.prisma.userProfile.groupBy({
      by: ['gender'],
      _count: true,
    });

    let male = 0,
      female = 0,
      nonbinary = 0,
      otherGender = 0,
      unknownGender = 0;
    for (const group of demographicsGroup) {
      switch (group.gender) {
        case GenderType.MALE:
          male = group._count;
          break;
        case GenderType.FEMALE:
          female = group._count;
          break;
        case GenderType.NONBINARY:
          nonbinary = group._count;
          break;
        case GenderType.OTHER:
          otherGender = group._count;
          break;
        default:
          unknownGender = group._count;
          break;
      }
    }

    // Identities
    const totalIdentities = await this.prisma.identity.count({
      where: { deletedAt: null },
    });
    const averageIdentitiesPerUser =
      totalUsers > 0 ? totalIdentities / totalUsers : 0;

    const identitiesGroup = await this.prisma.identity.groupBy({
      by: ['type'],
      where: { deletedAt: null },
      _count: true,
    });

    let instagramIds = 0,
      phoneIds = 0,
      emailIds = 0,
      linkedinIds = 0,
      twitterIds = 0,
      otherIds = 0;
    for (const group of identitiesGroup) {
      switch (group.type) {
        case IdentityType.INSTAGRAM:
          instagramIds = group._count;
          break;
        case IdentityType.PHONE:
          phoneIds = group._count;
          break;
        case IdentityType.EMAIL:
          emailIds = group._count;
          break;
        case IdentityType.LINKEDIN:
          linkedinIds = group._count;
          break;
        case IdentityType.TWITTER:
          twitterIds = group._count;
          break;
        case IdentityType.OTHER:
          otherIds = group._count;
          break;
      }
    }

    // Devices
    const totalDevices = await this.prisma.device.count();
    const activeDevices = await this.prisma.device.count({
      where: { isActive: true },
    });
    const averageDevicesPerUser =
      totalUsers > 0 ? totalDevices / totalUsers : 0;

    const devicesGroup = await this.prisma.device.groupBy({
      by: ['platform'],
      _count: true,
    });
    let androidDevices = 0,
      iosDevices = 0;
    for (const group of devicesGroup) {
      if (group.platform === DevicePlatform.ANDROID)
        androidDevices = group._count;
      else if (group.platform === DevicePlatform.IOS) iosDevices = group._count;
    }

    // Likes
    const totalLikes = await this.prisma.like.count({
      where: { deletedAt: null },
    });
    let totalLikesInTimeframe = totalLikes;
    if (hasTimeframe) {
      totalLikesInTimeframe = await this.prisma.like.count({
        where: { deletedAt: null, createdAt: timeframeFilter },
      });
    }
    const averageLikesPerUser = totalUsers > 0 ? totalLikes / totalUsers : 0;

    // Likes Target Identity Split
    // Requires a join, but prisma groupBy doesn't support relation fields directly without raw queries.
    // Instead, we can fetch count manually or use raw query.
    // A safe raw query for Likes grouped by IdentityType of targetIdentity
    const likesIdentityRaw = await this.prisma.$queryRaw<
      Array<{ type: string; count: bigint }>
    >`
      SELECT i."type", COUNT(l."id") as count
      FROM "Like" l
      JOIN "Identity" i ON l."targetIdentityId" = i."id"
      WHERE l."deletedAt" IS NULL
      GROUP BY i."type"
    `;

    let instagramLikes = 0,
      phoneLikes = 0,
      emailLikes = 0,
      linkedinLikes = 0,
      twitterLikes = 0,
      otherLikes = 0;

    for (const row of likesIdentityRaw) {
      const count = Number(row.count);
      switch (row.type) {
        case IdentityType.INSTAGRAM:
          instagramLikes = count;
          break;
        case IdentityType.PHONE:
          phoneLikes = count;
          break;
        case IdentityType.EMAIL:
          emailLikes = count;
          break;
        case IdentityType.LINKEDIN:
          linkedinLikes = count;
          break;
        case IdentityType.TWITTER:
          twitterLikes = count;
          break;
        case IdentityType.OTHER:
          otherLikes = count;
          break;
      }
    }

    const likesIntentGroup = await this.prisma.like.groupBy({
      by: ['intent'],
      where: { deletedAt: null },
      _count: true,
    });

    let relCount = 0,
      casCount = 0,
      openCount = 0;
    for (const group of likesIntentGroup) {
      if (group.intent === IntentType.RELATIONSHIP) relCount = group._count;
      else if (group.intent === IntentType.CASUAL) casCount = group._count;
      else if (group.intent === IntentType.OPEN) openCount = group._count;
    }

    const getPerc = (c: number, total: number) =>
      total > 0 ? (c / total) * 100 : 0;

    // Matches
    const totalMatches = await this.prisma.match.count({
      where: { deletedAt: null },
    });
    let totalMatchesInTimeframe = totalMatches;
    if (hasTimeframe) {
      totalMatchesInTimeframe = await this.prisma.match.count({
        where: { deletedAt: null, matchedAt: timeframeFilter },
      });
    }
    const averageMatchesPerUser =
      totalUsers > 0 ? totalMatches / totalUsers : 0;

    // Blocks
    const totalBlocks = await this.prisma.block.count({
      where: { deletedAt: null },
    });

    // Credits
    const creditsGivenAgg = await this.prisma.creditLedger.aggregate({
      where: { transactionType: CreditTransactionType.CREDIT },
      _sum: { amount: true },
    });
    let creditsGivenInTimeframe = creditsGivenAgg._sum.amount || 0;
    if (hasTimeframe) {
      const agg = await this.prisma.creditLedger.aggregate({
        where: {
          transactionType: CreditTransactionType.CREDIT,
          createdAt: timeframeFilter,
        },
        _sum: { amount: true },
      });
      creditsGivenInTimeframe = agg._sum.amount || 0;
    }

    const creditsGivenGroup = await this.prisma.creditLedger.groupBy({
      by: ['source'],
      where: { transactionType: CreditTransactionType.CREDIT },
      _sum: { amount: true },
    });

    let purchaseCred = 0,
      bonusCred = 0,
      referralCred = 0,
      adminCred = 0,
      likeUsageCred = 0;
    for (const group of creditsGivenGroup) {
      const sum = group._sum.amount || 0;
      switch (group.source) {
        case CreditSource.PURCHASE:
          purchaseCred = sum;
          break;
        case CreditSource.BONUS:
          bonusCred = sum;
          break;
        case CreditSource.REFERRAL:
          referralCred = sum;
          break;
        case CreditSource.ADMIN:
          adminCred = sum;
          break;
        case CreditSource.LIKE_USAGE:
          likeUsageCred = sum;
          break;
      }
    }

    const creditsUtilisedAgg = await this.prisma.creditLedger.aggregate({
      where: { transactionType: CreditTransactionType.DEBIT },
      _sum: { amount: true },
    });
    let creditsUtilisedInTimeframe = creditsUtilisedAgg._sum.amount || 0;
    if (hasTimeframe) {
      const agg = await this.prisma.creditLedger.aggregate({
        where: {
          transactionType: CreditTransactionType.DEBIT,
          createdAt: timeframeFilter,
        },
        _sum: { amount: true },
      });
      creditsUtilisedInTimeframe = agg._sum.amount || 0;
    }

    return {
      timeframe: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
      users: {
        total: totalUsers,
        acquiredInTimeframe: acquiredInTimeframe,
        completedProfiles: completedProfiles,
        demographics: {
          male,
          female,
          nonbinary,
          other: otherGender,
          unknown: unknownGender,
        },
      },
      identities: {
        total: totalIdentities,
        averagePerUser: averageIdentitiesPerUser,
        split: {
          instagram: instagramIds,
          phone: phoneIds,
          email: emailIds,
          linkedin: linkedinIds,
          twitter: twitterIds,
          other: otherIds,
        },
      },
      devices: {
        total: totalDevices,
        active: activeDevices,
        averagePerUser: averageDevicesPerUser,
        platformSplit: {
          android: androidDevices,
          ios: iosDevices,
        },
      },
      likes: {
        total: totalLikes,
        totalInTimeframe: totalLikesInTimeframe,
        averagePerUser: averageLikesPerUser,
        targetIdentitySplit: {
          instagram: instagramLikes,
          phone: phoneLikes,
          email: emailLikes,
          linkedin: linkedinLikes,
          twitter: twitterLikes,
          other: otherLikes,
        },
        intentSplit: {
          relationship: {
            count: relCount,
            percentage: getPerc(relCount, totalLikes),
          },
          casual: {
            count: casCount,
            percentage: getPerc(casCount, totalLikes),
          },
          open: {
            count: openCount,
            percentage: getPerc(openCount, totalLikes),
          },
        },
      },
      matches: {
        total: totalMatches,
        totalInTimeframe: totalMatchesInTimeframe,
        averagePerUser: averageMatchesPerUser,
      },
      blocks: {
        total: totalBlocks,
      },
      credits: {
        given: {
          total: creditsGivenAgg._sum.amount || 0,
          inTimeframe: creditsGivenInTimeframe,
          splitBySource: {
            purchase: purchaseCred,
            bonus: bonusCred,
            referral: referralCred,
            admin: adminCred,
            likeUsage: likeUsageCred,
          },
        },
        utilised: {
          total: creditsUtilisedAgg._sum.amount || 0,
          inTimeframe: creditsUtilisedInTimeframe,
        },
      },
    };
  }
}
