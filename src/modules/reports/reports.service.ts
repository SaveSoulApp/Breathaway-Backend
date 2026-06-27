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
import {
  GetReportRequestDto,
  ReportTimeframeResponseDto,
  ReportTotalResponseDto,
} from './dto';

@Injectable()
export class ReportsService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  async generateTotalReport(): Promise<ReportTotalResponseDto> {
    // Users
    const totalUsers = await this.prisma.user.count({
      where: { deletedAt: null },
    });

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
    const averageLikesPerUser = totalUsers > 0 ? totalLikes / totalUsers : 0;

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

    return {
      users: {
        total: totalUsers,
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
        averagePerUser: averageMatchesPerUser,
      },
      blocks: {
        total: totalBlocks,
      },
      credits: {
        given: {
          total: creditsGivenAgg._sum.amount || 0,
          splitBySource: {
            purchase: purchaseCred,
            bonus: bonusCred,
            referral: referralCred,
            admin: adminCred,
            likeUsage: likeUsageCred,
          },
        },
        utilisedTotal: creditsUtilisedAgg._sum.amount || 0,
      },
    };
  }

  async generateTimeframeReport(
    query: GetReportRequestDto,
  ): Promise<ReportTimeframeResponseDto> {
    const { startDate, endDate } = query;

    const actualEndDate = endDate || new Date();

    const timeframeFilter: Prisma.DateTimeFilter = { lte: actualEndDate };
    if (startDate) {
      timeframeFilter.gte = startDate;
    }

    // Users
    const acquiredUsers = await this.prisma.user.count({
      where: { deletedAt: null, createdAt: timeframeFilter },
    });

    const acquiredUsersDemographics = await this.prisma.userProfile.groupBy({
      by: ['gender'],
      where: {
        user: { deletedAt: null, createdAt: timeframeFilter },
      },
      _count: true,
    });

    let male = 0,
      female = 0,
      nonbinary = 0,
      otherGender = 0,
      unknownGender = 0;
    for (const group of acquiredUsersDemographics) {
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
    const createdIdentities = await this.prisma.identity.count({
      where: { deletedAt: null, createdAt: timeframeFilter },
    });

    const createdIdentitiesGroup = await this.prisma.identity.groupBy({
      by: ['type'],
      where: { deletedAt: null, createdAt: timeframeFilter },
      _count: true,
    });

    let instagramIds = 0,
      phoneIds = 0,
      emailIds = 0,
      linkedinIds = 0,
      twitterIds = 0,
      otherIds = 0;
    for (const group of createdIdentitiesGroup) {
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
    const registeredDevices = await this.prisma.device.count({
      where: { createdAt: timeframeFilter },
    });

    const devicesGroup = await this.prisma.device.groupBy({
      by: ['platform'],
      where: { createdAt: timeframeFilter },
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
    const likesMade = await this.prisma.like.count({
      where: { deletedAt: null, createdAt: timeframeFilter },
    });

    let instagramLikes = 0,
      phoneLikes = 0,
      emailLikes = 0,
      linkedinLikes = 0,
      twitterLikes = 0,
      otherLikes = 0;

    if (likesMade > 0) {
      let likesIdentityRaw: Array<{ type: string; count: bigint }> = [];

      if (startDate) {
        likesIdentityRaw = await this.prisma.$queryRaw<
          Array<{ type: string; count: bigint }>
        >`
          SELECT i."type", COUNT(l."id") as count
          FROM "Like" l
          JOIN "Identity" i ON l."targetIdentityId" = i."id"
          WHERE l."deletedAt" IS NULL 
          AND l."createdAt" >= ${startDate} 
          AND l."createdAt" <= ${actualEndDate}
          GROUP BY i."type"
        `;
      } else {
        likesIdentityRaw = await this.prisma.$queryRaw<
          Array<{ type: string; count: bigint }>
        >`
          SELECT i."type", COUNT(l."id") as count
          FROM "Like" l
          JOIN "Identity" i ON l."targetIdentityId" = i."id"
          WHERE l."deletedAt" IS NULL 
          AND l."createdAt" <= ${actualEndDate}
          GROUP BY i."type"
        `;
      }

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
    }

    const likesIntentGroup = await this.prisma.like.groupBy({
      by: ['intent'],
      where: { deletedAt: null, createdAt: timeframeFilter },
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
    const matchesMade = await this.prisma.match.count({
      where: { deletedAt: null, matchedAt: timeframeFilter },
    });

    // Blocks
    const blocksMade = await this.prisma.block.count({
      where: { deletedAt: null, createdAt: timeframeFilter },
    });

    // Credits
    const creditsGivenAgg = await this.prisma.creditLedger.aggregate({
      where: {
        transactionType: CreditTransactionType.CREDIT,
        createdAt: timeframeFilter,
      },
      _sum: { amount: true },
    });

    const creditsGivenGroup = await this.prisma.creditLedger.groupBy({
      by: ['source'],
      where: {
        transactionType: CreditTransactionType.CREDIT,
        createdAt: timeframeFilter,
      },
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
      where: {
        transactionType: CreditTransactionType.DEBIT,
        createdAt: timeframeFilter,
      },
      _sum: { amount: true },
    });

    return {
      timeframe: {
        startDate: startDate || null,
        endDate: actualEndDate,
      },
      users: {
        acquired: acquiredUsers,
        demographics: {
          male,
          female,
          nonbinary,
          other: otherGender,
          unknown: unknownGender,
        },
      },
      identities: {
        created: createdIdentities,
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
        registered: registeredDevices,
        platformSplit: {
          android: androidDevices,
          ios: iosDevices,
        },
      },
      likes: {
        made: likesMade,
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
            percentage: getPerc(relCount, likesMade),
          },
          casual: {
            count: casCount,
            percentage: getPerc(casCount, likesMade),
          },
          open: {
            count: openCount,
            percentage: getPerc(openCount, likesMade),
          },
        },
      },
      matches: {
        matched: matchesMade,
      },
      blocks: {
        total: blocksMade,
      },
      credits: {
        given: {
          total: creditsGivenAgg._sum.amount || 0,
          splitBySource: {
            purchase: purchaseCred,
            bonus: bonusCred,
            referral: referralCred,
            admin: adminCred,
            likeUsage: likeUsageCred,
          },
        },
        utilisedTotal: creditsUtilisedAgg._sum.amount || 0,
      },
    };
  }
}
