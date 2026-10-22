import { Injectable } from '@nestjs/common';
import {
  CreditSource,
  CreditTransactionType,
  DevicePlatform,
  GenderType,
  IdentityType,
  IntentType,
  LikeStatus,
  MatchStatus,
  PaymentGateway,
  PaymentOrderStatus,
  Prisma,
  StorePlatform,
  SubscriptionStatus,
  TransactionChannel,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';

import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';

import {
  AppVersionDistributionDto,
  CountryDistributionDto,
  CurrencyRevenueDto,
  GetReportRequestDto,
  GetReportTrendsRequestDto,
  ReportEngagementResponseDto,
  ReportFinancialResponseDto,
  ReportSummaryResponseDto,
  ReportTimeframeResponseDto,
  ReportTotalResponseDto,
  ReportTrendInterval,
  ReportTrendMetric,
  ReportTrendsResponseDto,
  ReportUsersResponseDto,
  SubscriptionPlanStatDto,
  TrendPointDto,
} from './dto';

@Injectable()
export class ReportsService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  /**
   * Helper to round float values to exactly two decimal places.
   */
  private round2(value: number): number {
    return Number(value.toFixed(2));
  }

  // ─────────────────────────────────────────────────────────────
  // 1. DASHBOARD SUMMARY (EXECUTIVE KPI BANNERS)
  // ─────────────────────────────────────────────────────────────

  async getSummaryReport(
    query?: GetReportRequestDto,
  ): Promise<ReportSummaryResponseDto> {
    const startDate = query?.startDate;
    const endDate = query?.endDate || new Date();

    const timeframeFilter: Prisma.DateTimeFilter = { lte: endDate };
    if (startDate) {
      timeframeFilter.gte = startDate;
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeSessionsUsers,
      completedProfiles,
      totalGrossRevenueAgg,
      periodRevenueAgg,
      activeSubscriptionsCount,
      successfulOrdersCount,
      totalLikesSent,
      pendingLikes,
      totalMatches,
      claimedIdentities,
      unclaimedIdentities,
      viralPendingLikesCount,
      totalMessages,
      readMessages,
      activeRoomsRaw,
    ] = await Promise.all([
      // Users
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.userSession.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          user: { deletedAt: null },
        },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.userProfile.count({
        where: { user: { deletedAt: null } },
      }),
      // Financial
      this.prisma.transaction.aggregate({
        where: {
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          occurredAt: timeframeFilter,
        },
        _sum: { amount: true },
      }),
      this.prisma.userSubscription.count({
        where: { status: SubscriptionStatus.ACTIVE },
      }),
      this.prisma.paymentOrder.count({
        where: { status: PaymentOrderStatus.PAID },
      }),
      // Engagement
      this.prisma.like.count({ where: { deletedAt: null } }),
      this.prisma.like.count({
        where: { status: LikeStatus.PENDING, deletedAt: null },
      }),
      this.prisma.match.count({ where: { deletedAt: null } }),
      // Viral
      this.prisma.identity.count({
        where: { userId: { not: null }, deletedAt: null },
      }),
      this.prisma.identity.count({
        where: { userId: null, deletedAt: null },
      }),
      this.prisma.like.count({
        where: {
          status: LikeStatus.PENDING,
          deletedAt: null,
          targetIdentity: { userId: null },
        },
      }),
      // Chat
      this.prisma.message.count(),
      this.prisma.message.count({ where: { readAt: { not: null } } }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "roomId") as count FROM "Message"
      `,
    ]);

    const active30d = activeSessionsUsers.length;
    const completionRatePercent =
      totalUsers > 0 ? this.round2((completedProfiles / totalUsers) * 100) : 0;
    const matchConversionRatePercent =
      totalLikesSent > 0
        ? this.round2(((totalMatches * 2) / totalLikesSent) * 100)
        : 0;
    const totalIdentities = claimedIdentities + unclaimedIdentities;
    const viralClaimRatePercent =
      totalIdentities > 0
        ? this.round2((claimedIdentities / totalIdentities) * 100)
        : 0;
    const readRatePercent =
      totalMessages > 0 ? this.round2((readMessages / totalMessages) * 100) : 0;
    const activeRoomsCount =
      activeRoomsRaw.length > 0 ? Number(activeRoomsRaw[0].count) : 0;

    return {
      users: {
        total: totalUsers,
        active30d,
        completedProfiles,
        completionRatePercent,
      },
      financial: {
        totalGrossRevenue: this.round2(
          Number(totalGrossRevenueAgg._sum.amount || 0),
        ),
        periodRevenue: this.round2(Number(periodRevenueAgg._sum.amount || 0)),
        activeSubscriptionsCount,
        successfulOrdersCount,
      },
      engagement: {
        totalLikesSent,
        pendingLikes,
        totalMatches,
        matchConversionRatePercent,
      },
      viral: {
        claimedIdentities,
        unclaimedIdentities,
        viralPendingLikesCount,
        viralClaimRatePercent,
      },
      chat: {
        totalMessages,
        activeRoomsCount,
        readRatePercent,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 2. USERS & DEMOGRAPHICS REPORT
  // ─────────────────────────────────────────────────────────────

  async getUsersReport(
    _query?: GetReportRequestDto,
  ): Promise<ReportUsersResponseDto> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeSessionsUsers,
      completedProfiles,
      demographicsGroup,
      ageBracketsRaw,
      countrySplitRaw,
      totalDevices,
      activeDevices,
      devicesGroup,
      appVersionsRaw,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.userSession.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          user: { deletedAt: null },
        },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.userProfile.count({
        where: { user: { deletedAt: null } },
      }),
      this.prisma.userProfile.groupBy({
        by: ['gender'],
        where: { user: { deletedAt: null } },
        _count: true,
      }),
      this.prisma.$queryRaw<Array<{ bracket: string; count: bigint }>>`
        SELECT 
          CASE 
            WHEN up."dateOfBirth" IS NULL THEN 'unknown'
            WHEN date_part('year', age(CURRENT_DATE, up."dateOfBirth")) < 25 THEN 'age18To24'
            WHEN date_part('year', age(CURRENT_DATE, up."dateOfBirth")) < 35 THEN 'age25To34'
            WHEN date_part('year', age(CURRENT_DATE, up."dateOfBirth")) < 45 THEN 'age35To44'
            ELSE 'age45Plus'
          END AS bracket,
          COUNT(*) as count
        FROM "UserProfile" up
        JOIN "User" u ON up."userId" = u."id"
        WHERE u."deletedAt" IS NULL
        GROUP BY bracket
      `,
      this.prisma.$queryRaw<Array<{ countryCode: string; count: bigint }>>`
        SELECT "countryCode", COUNT(*) as count
        FROM "User"
        WHERE "deletedAt" IS NULL AND "countryCode" IS NOT NULL
        GROUP BY "countryCode"
        ORDER BY count DESC
        LIMIT 10
      `,
      this.prisma.device.count({ where: { user: { deletedAt: null } } }),
      this.prisma.device.count({
        where: { isActive: true, user: { deletedAt: null } },
      }),
      this.prisma.device.groupBy({
        by: ['platform'],
        where: { user: { deletedAt: null } },
        _count: true,
      }),
      this.prisma.$queryRaw<
        Array<{ platform: string; version: string; count: bigint }>
      >`
        SELECT 
          d."platform"::text as platform, 
          COALESCE(d."appVersion", 'unknown') as version, 
          COUNT(*) as count
        FROM "Device" d
        JOIN "User" u ON d."userId" = u."id"
        WHERE u."deletedAt" IS NULL AND d."isActive" = true
        GROUP BY d."platform", version
        ORDER BY count DESC
        LIMIT 10
      `,
    ]);

    // Gender parsing
    let male = 0,
      female = 0,
      nonbinary = 0,
      otherGender = 0;
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
      }
    }
    const unknownGender = Math.max(
      0,
      totalUsers - (male + female + nonbinary + otherGender),
    );

    // Age brackets parsing
    let age18To24 = 0,
      age25To34 = 0,
      age35To44 = 0,
      age45Plus = 0;
    for (const row of ageBracketsRaw) {
      const count = Number(row.count);
      switch (row.bracket) {
        case 'age18To24':
          age18To24 = count;
          break;
        case 'age25To34':
          age25To34 = count;
          break;
        case 'age35To44':
          age35To44 = count;
          break;
        case 'age45Plus':
          age45Plus = count;
          break;
      }
    }
    const unknownAge = Math.max(
      0,
      totalUsers - (age18To24 + age25To34 + age35To44 + age45Plus),
    );

    // Geography parsing
    const totalWithCountry = countrySplitRaw.reduce(
      (acc, curr) => acc + Number(curr.count),
      0,
    );
    const geography: CountryDistributionDto[] = countrySplitRaw.map((row) => {
      const count = Number(row.count);
      const percentage =
        totalWithCountry > 0
          ? this.round2((count / totalWithCountry) * 100)
          : 0;
      return {
        countryCode: row.countryCode,
        count,
        percentage,
      };
    });

    // Devices platform parsing
    let androidDevices = 0,
      iosDevices = 0,
      webDevices = 0;
    for (const group of devicesGroup) {
      if (group.platform === DevicePlatform.ANDROID)
        androidDevices = group._count;
      else if (group.platform === DevicePlatform.IOS) iosDevices = group._count;
      else if (group.platform === DevicePlatform.WEB) webDevices = group._count;
    }

    // App versions parsing
    const appVersions: AppVersionDistributionDto[] = appVersionsRaw.map(
      (row) => ({
        platform: row.platform,
        version: row.version,
        count: Number(row.count),
      }),
    );

    return {
      total: totalUsers,
      active30d: activeSessionsUsers.length,
      completedProfiles,
      demographics: {
        gender: {
          male,
          female,
          nonbinary,
          other: otherGender,
          unknown: unknownGender,
        },
        ageBrackets: {
          age18To24,
          age25To34,
          age35To44,
          age45Plus,
          unknown: unknownAge,
        },
      },
      geography,
      devices: {
        total: totalDevices,
        active: activeDevices,
        platformSplit: {
          android: androidDevices,
          ios: iosDevices,
          web: webDevices,
        },
        appVersions,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3. ENGAGEMENT & SOCIAL REPORT
  // ─────────────────────────────────────────────────────────────

  async getEngagementReport(
    _query?: GetReportRequestDto,
  ): Promise<ReportEngagementResponseDto> {
    const [
      totalUsers,
      totalIdentities,
      claimedIdentities,
      unclaimedIdentities,
      verifiedIdentities,
      viralPendingLikes,
      identitiesGroup,
      totalLikes,
      likeStatusGroup,
      likeIntentGroup,
      likesIdentityRaw,
      totalMatches,
      matchStatusGroup,
      mutualIntentRaw,
      totalChatRooms,
      activeRoomsRaw,
      totalMessages,
      readMessages,
      totalBlocks,
      directUserBlocks,
      phoneHashBlocks,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      // Identities
      this.prisma.identity.count({ where: { deletedAt: null } }),
      this.prisma.identity.count({
        where: { userId: { not: null }, deletedAt: null },
      }),
      this.prisma.identity.count({
        where: { userId: null, deletedAt: null },
      }),
      this.prisma.identity.count({
        where: { isVerified: true, deletedAt: null },
      }),
      this.prisma.like.count({
        where: {
          status: LikeStatus.PENDING,
          deletedAt: null,
          targetIdentity: { userId: null },
        },
      }),
      this.prisma.identity.groupBy({
        by: ['type'],
        where: { deletedAt: null },
        _count: true,
      }),
      // Likes
      this.prisma.like.count({ where: { deletedAt: null } }),
      this.prisma.like.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: true,
      }),
      this.prisma.like.groupBy({
        by: ['intent'],
        where: { deletedAt: null },
        _count: true,
      }),
      this.prisma.$queryRaw<Array<{ type: string; count: bigint }>>`
        SELECT i."type", COUNT(l."id") as count
        FROM "Like" l
        JOIN "Identity" i ON l."targetIdentityId" = i."id"
        WHERE l."deletedAt" IS NULL
        GROUP BY i."type"
      `,
      // Matches
      this.prisma.match.count({ where: { deletedAt: null } }),
      this.prisma.match.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: true,
      }),
      this.prisma.$queryRaw<Array<{ pairing: string; count: bigint }>>`
        SELECT 
          CASE 
            WHEN "intentOne" = 'RELATIONSHIP' AND "intentTwo" = 'RELATIONSHIP' THEN 'relationshipRelationship'
            WHEN "intentOne" = 'CASUAL' AND "intentTwo" = 'CASUAL' THEN 'casualCasual'
            WHEN "intentOne" = 'OPEN' AND "intentTwo" = 'OPEN' THEN 'openOpen'
            ELSE 'mixed'
          END AS pairing,
          COUNT(*) as count
        FROM "Match"
        WHERE "deletedAt" IS NULL
        GROUP BY pairing
      `,
      // Chats
      this.prisma.chatRoom.count(),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "roomId") as count FROM "Message"
      `,
      this.prisma.message.count(),
      this.prisma.message.count({ where: { readAt: { not: null } } }),
      // Safety
      this.prisma.block.count({ where: { deletedAt: null } }),
      this.prisma.block.count({
        where: { blockedUserId: { not: null }, deletedAt: null },
      }),
      this.prisma.block.count({
        where: { blockedPhoneHash: { not: null }, deletedAt: null },
      }),
    ]);

    // Identity split
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

    // Like status split
    let pendingLikes = 0,
      matchedLikes = 0,
      voidedLikes = 0,
      withdrawnLikes = 0,
      deletedLikes = 0;
    for (const group of likeStatusGroup) {
      switch (group.status) {
        case LikeStatus.PENDING:
          pendingLikes = group._count;
          break;
        case LikeStatus.MATCHED:
          matchedLikes = group._count;
          break;
        case LikeStatus.VOIDED:
          voidedLikes = group._count;
          break;
        case LikeStatus.WITHDRAWN:
          withdrawnLikes = group._count;
          break;
        case LikeStatus.DELETED:
          deletedLikes = group._count;
          break;
      }
    }

    // Like intent split
    let relCount = 0,
      casCount = 0,
      openCount = 0;
    for (const group of likeIntentGroup) {
      if (group.intent === IntentType.RELATIONSHIP) relCount = group._count;
      else if (group.intent === IntentType.CASUAL) casCount = group._count;
      else if (group.intent === IntentType.OPEN) openCount = group._count;
    }

    const getPerc = (c: number, total: number) =>
      total > 0 ? this.round2((c / total) * 100) : 0;

    // Like target identity split
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

    // Match status split
    let activeMatches = 0,
      unmatchedMatches = 0,
      blockedMatches = 0;
    for (const group of matchStatusGroup) {
      switch (group.status) {
        case MatchStatus.ACTIVE:
          activeMatches = group._count;
          break;
        case MatchStatus.UNMATCHED:
          unmatchedMatches = group._count;
          break;
        case MatchStatus.BLOCKED:
          blockedMatches = group._count;
          break;
      }
    }

    // Mutual intent split
    let relationshipRelationship = 0,
      casualCasual = 0,
      openOpen = 0,
      mixed = 0;
    for (const row of mutualIntentRaw) {
      const count = Number(row.count);
      switch (row.pairing) {
        case 'relationshipRelationship':
          relationshipRelationship = count;
          break;
        case 'casualCasual':
          casualCasual = count;
          break;
        case 'openOpen':
          openOpen = count;
          break;
        default:
          mixed = count;
          break;
      }
    }

    const activeRooms =
      activeRoomsRaw.length > 0 ? Number(activeRoomsRaw[0].count) : 0;
    const matchConversionRatePercent =
      totalLikes > 0 ? this.round2(((totalMatches * 2) / totalLikes) * 100) : 0;
    const chatReadRatePercent =
      totalMessages > 0 ? this.round2((readMessages / totalMessages) * 100) : 0;
    const avgMessagesPerActiveRoom =
      activeRooms > 0 ? this.round2(totalMessages / activeRooms) : 0;

    return {
      identities: {
        total: totalIdentities,
        claimed: claimedIdentities,
        unclaimed: unclaimedIdentities,
        verified: verifiedIdentities,
        viralPendingLikes,
        split: {
          instagram: instagramIds,
          phone: phoneIds,
          email: emailIds,
          linkedin: linkedinIds,
          twitter: twitterIds,
          other: otherIds,
        },
      },
      likes: {
        total: totalLikes,
        averagePerUser:
          totalUsers > 0 ? this.round2(totalLikes / totalUsers) : 0,
        statusSplit: {
          pending: pendingLikes,
          matched: matchedLikes,
          voided: voidedLikes,
          withdrawn: withdrawnLikes,
          deleted: deletedLikes,
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
        targetIdentitySplit: {
          instagram: instagramLikes,
          phone: phoneLikes,
          email: emailLikes,
          linkedin: linkedinLikes,
          twitter: twitterLikes,
          other: otherLikes,
        },
      },
      matches: {
        total: totalMatches,
        conversionRatePercent: matchConversionRatePercent,
        statusSplit: {
          active: activeMatches,
          unmatched: unmatchedMatches,
          blocked: blockedMatches,
        },
        mutualIntentSplit: {
          relationshipRelationship,
          casualCasual,
          openOpen,
          mixed,
        },
      },
      chats: {
        totalRooms: totalChatRooms,
        activeRooms,
        totalMessages,
        readRatePercent: chatReadRatePercent,
        averageMessagesPerActiveRoom: avgMessagesPerActiveRoom,
      },
      safety: {
        totalBlocks,
        directUserBlocks,
        phoneHashBlocks,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 4. FINANCIAL & REVENUE REPORT
  // ─────────────────────────────────────────────────────────────

  async getFinancialReport(
    _query?: GetReportRequestDto,
  ): Promise<ReportFinancialResponseDto> {
    const [
      totalGrossAgg,
      currencySplitRaw,
      channelSplitGroup,
      gatewaySplitGroup,
      ordersGroup,
      totalOrders,
      subscriptionsGroup,
      platformSubscriptionsGroup,
      planSplitRaw,
      creditsGivenAgg,
      creditsGivenGroup,
      creditsUtilisedAgg,
    ] = await Promise.all([
      // Revenue
      this.prisma.transaction.aggregate({
        where: {
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
        },
        _sum: { amount: true },
      }),
      this.prisma.$queryRaw<
        Array<{ currency: string; amount: Prisma.Decimal; count: bigint }>
      >`
        SELECT COALESCE("currency", 'INR') as currency, SUM("amount") as amount, COUNT(*) as count
        FROM "Transaction"
        WHERE "type" = 'PURCHASE' AND "status" = 'COMPLETED'
        GROUP BY currency
      `,
      this.prisma.transaction.groupBy({
        by: ['channel'],
        where: {
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['gateway'],
        where: {
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
        },
        _sum: { amount: true },
      }),
      // Orders
      this.prisma.paymentOrder.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.paymentOrder.count(),
      // Subscriptions
      this.prisma.userSubscription.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.userSubscription.groupBy({
        by: ['storePlatform'],
        where: { status: SubscriptionStatus.ACTIVE },
        _count: true,
      }),
      this.prisma.$queryRaw<
        Array<{
          planId: string;
          slug: string;
          name: string;
          activeSubscribers: bigint;
        }>
      >`
        SELECT p."id" as "planId", p."slug", p."name", COUNT(s."id") as "activeSubscribers"
        FROM "SubscriptionPlan" p
        LEFT JOIN "UserSubscription" s ON s."planId" = p."id" AND s."status" = 'ACTIVE'
        GROUP BY p."id", p."slug", p."name"
        ORDER BY "activeSubscribers" DESC
      `,
      // Credits
      this.prisma.creditLedger.aggregate({
        where: { transactionType: CreditTransactionType.CREDIT },
        _sum: { amount: true },
      }),
      this.prisma.creditLedger.groupBy({
        by: ['source'],
        where: { transactionType: CreditTransactionType.CREDIT },
        _sum: { amount: true },
      }),
      this.prisma.creditLedger.aggregate({
        where: { transactionType: CreditTransactionType.DEBIT },
        _sum: { amount: true },
      }),
    ]);

    // Currency split
    const currencies: CurrencyRevenueDto[] = currencySplitRaw.map((row) => ({
      currency: row.currency,
      amount: this.round2(Number(row.amount) || 0),
      count: Number(row.count) || 0,
    }));

    // Channel revenue split
    let iosRev = 0,
      androidRev = 0,
      webRev = 0;
    for (const group of channelSplitGroup) {
      const amt = this.round2(Number(group._sum.amount || 0));
      if (group.channel === TransactionChannel.IOS) iosRev = amt;
      else if (group.channel === TransactionChannel.ANDROID) androidRev = amt;
      else if (group.channel === TransactionChannel.WEB) webRev = amt;
    }

    // Gateway revenue split
    let revenuecatRev = 0,
      razorpayRev = 0,
      cashfreeRev = 0,
      easebuzzRev = 0,
      decentroRev = 0;
    for (const group of gatewaySplitGroup) {
      const amt = this.round2(Number(group._sum.amount || 0));
      switch (group.gateway) {
        case PaymentGateway.REVENUECAT:
          revenuecatRev = amt;
          break;
        case PaymentGateway.RAZORPAY:
          razorpayRev = amt;
          break;
        case PaymentGateway.CASHFREE:
          cashfreeRev = amt;
          break;
        case PaymentGateway.EASEBUZZ:
          easebuzzRev = amt;
          break;
        case PaymentGateway.DECENTRO:
          decentroRev = amt;
          break;
      }
    }

    // Orders status parsing
    let paidOrders = 0,
      failedOrders = 0,
      expiredOrders = 0,
      refundedOrders = 0;
    for (const group of ordersGroup) {
      switch (group.status) {
        case PaymentOrderStatus.PAID:
          paidOrders = group._count;
          break;
        case PaymentOrderStatus.FAILED:
          failedOrders = group._count;
          break;
        case PaymentOrderStatus.EXPIRED:
          expiredOrders = group._count;
          break;
        case PaymentOrderStatus.REFUNDED:
          refundedOrders = group._count;
          break;
      }
    }
    const successRatePercent =
      totalOrders > 0 ? this.round2((paidOrders / totalOrders) * 100) : 0;

    // Subscriptions status parsing
    const trialSub = 0;
    let activeSub = 0,
      graceSub = 0,
      cancelledSub = 0,
      expiredSub = 0;
    for (const group of subscriptionsGroup) {
      switch (group.status) {
        case SubscriptionStatus.ACTIVE:
          activeSub = group._count;
          break;
        case SubscriptionStatus.GRACE_PERIOD:
          graceSub = group._count;
          break;
        case SubscriptionStatus.CANCELLED:
          cancelledSub = group._count;
          break;
        case SubscriptionStatus.EXPIRED:
          expiredSub = group._count;
          break;
      }
    }

    // Platform subscriptions split
    let appleSub = 0,
      googleSub = 0;
    for (const group of platformSubscriptionsGroup) {
      if (group.storePlatform === StorePlatform.APPLE) appleSub = group._count;
      else if (group.storePlatform === StorePlatform.GOOGLE)
        googleSub = group._count;
    }

    // Plan split
    const planSplit: SubscriptionPlanStatDto[] = planSplitRaw.map((row) => ({
      planId: row.planId,
      slug: row.slug,
      name: row.name,
      activeSubscribers: Number(row.activeSubscribers),
    }));

    // Credits split
    let purchaseCred = 0,
      bonusCred = 0,
      referralCred = 0,
      adminCred = 0,
      likeUsageCred = 0,
      expiredCred = 0,
      subscriptionCred = 0;

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
        case CreditSource.EXPIRED:
          expiredCred = sum;
          break;
        case CreditSource.SUBSCRIPTION:
          subscriptionCred = sum;
          break;
      }
    }

    const totalGivenCredits = creditsGivenAgg._sum.amount || 0;
    const totalUtilisedCredits = creditsUtilisedAgg._sum.amount || 0;
    const circulatingBalance = totalGivenCredits - totalUtilisedCredits;

    return {
      revenue: {
        totalGross: this.round2(Number(totalGrossAgg._sum.amount || 0)),
        currencies,
        channelSplit: {
          ios: iosRev,
          android: androidRev,
          web: webRev,
        },
        gatewaySplit: {
          revenuecat: revenuecatRev,
          razorpay: razorpayRev,
          cashfree: cashfreeRev,
          easebuzz: easebuzzRev,
          decentro: decentroRev,
        },
      },
      orders: {
        totalOrders,
        paid: paidOrders,
        failed: failedOrders,
        expired: expiredOrders,
        refunded: refundedOrders,
        successRatePercent,
      },
      subscriptions: {
        totalActive: activeSub,
        trial: trialSub,
        gracePeriod: graceSub,
        cancelled: cancelledSub,
        expired: expiredSub,
        platformSplit: {
          apple: appleSub,
          google: googleSub,
        },
        planSplit,
      },
      credits: {
        given: {
          total: totalGivenCredits,
          splitBySource: {
            purchase: purchaseCred,
            bonus: bonusCred,
            referral: referralCred,
            admin: adminCred,
            likeUsage: likeUsageCred,
            expired: expiredCred,
            subscription: subscriptionCred,
          },
        },
        utilisedTotal: totalUtilisedCredits,
        circulatingBalance,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 5. TRENDS REPORT (BAR & LINE CHARTS TIME-SERIES)
  // ─────────────────────────────────────────────────────────────

  async getTrendsReport(
    query: GetReportTrendsRequestDto,
  ): Promise<ReportTrendsResponseDto> {
    const interval = query.interval || ReportTrendInterval.DAY;
    const metric = query.metric || ReportTrendMetric.USERS;
    const endDate = query.endDate || new Date();
    const startDate =
      query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const intervalSql =
      interval === ReportTrendInterval.MONTH
        ? 'month'
        : interval === ReportTrendInterval.WEEK
          ? 'week'
          : 'day';

    let data: TrendPointDto[] = [];

    switch (metric) {
      case ReportTrendMetric.USERS: {
        const raw = await this.prisma.$queryRaw<
          Array<{ interval_date: Date; count: bigint }>
        >`
          SELECT 
            date_trunc(${intervalSql}, "createdAt") AS interval_date,
            COUNT("id") AS count
          FROM "User"
          WHERE "deletedAt" IS NULL
            AND "createdAt" >= ${startDate}
            AND "createdAt" <= ${endDate}
          GROUP BY interval_date
          ORDER BY interval_date ASC
        `;
        data = raw.map((r) => ({
          date: r.interval_date.toISOString(),
          value: Number(r.count),
        }));
        break;
      }
      case ReportTrendMetric.REVENUE: {
        const raw = await this.prisma.$queryRaw<
          Array<{ interval_date: Date; revenue: Prisma.Decimal }>
        >`
          SELECT 
            date_trunc(${intervalSql}, "occurredAt") AS interval_date,
            COALESCE(SUM("amount"), 0) AS revenue
          FROM "Transaction"
          WHERE "type" = 'PURCHASE' 
            AND "status" = 'COMPLETED'
            AND "occurredAt" >= ${startDate}
            AND "occurredAt" <= ${endDate}
          GROUP BY interval_date
          ORDER BY interval_date ASC
        `;
        data = raw.map((r) => ({
          date: r.interval_date.toISOString(),
          value: this.round2(Number(r.revenue)),
        }));
        break;
      }
      case ReportTrendMetric.LIKES: {
        const raw = await this.prisma.$queryRaw<
          Array<{ interval_date: Date; count: bigint }>
        >`
          SELECT 
            date_trunc(${intervalSql}, "createdAt") AS interval_date,
            COUNT("id") AS count
          FROM "Like"
          WHERE "deletedAt" IS NULL
            AND "createdAt" >= ${startDate}
            AND "createdAt" <= ${endDate}
          GROUP BY interval_date
          ORDER BY interval_date ASC
        `;
        data = raw.map((r) => ({
          date: r.interval_date.toISOString(),
          value: Number(r.count),
        }));
        break;
      }
      case ReportTrendMetric.MATCHES: {
        const raw = await this.prisma.$queryRaw<
          Array<{ interval_date: Date; count: bigint }>
        >`
          SELECT 
            date_trunc(${intervalSql}, "matchedAt") AS interval_date,
            COUNT("id") AS count
          FROM "Match"
          WHERE "deletedAt" IS NULL
            AND "matchedAt" >= ${startDate}
            AND "matchedAt" <= ${endDate}
          GROUP BY interval_date
          ORDER BY interval_date ASC
        `;
        data = raw.map((r) => ({
          date: r.interval_date.toISOString(),
          value: Number(r.count),
        }));
        break;
      }
      case ReportTrendMetric.MESSAGES: {
        const raw = await this.prisma.$queryRaw<
          Array<{ interval_date: Date; count: bigint }>
        >`
          SELECT 
            date_trunc(${intervalSql}, "createdAt") AS interval_date,
            COUNT("id") AS count
          FROM "Message"
          WHERE "createdAt" >= ${startDate}
            AND "createdAt" <= ${endDate}
          GROUP BY interval_date
          ORDER BY interval_date ASC
        `;
        data = raw.map((r) => ({
          date: r.interval_date.toISOString(),
          value: Number(r.count),
        }));
        break;
      }
      case ReportTrendMetric.ORDERS: {
        const raw = await this.prisma.$queryRaw<
          Array<{ interval_date: Date; count: bigint }>
        >`
          SELECT 
            date_trunc(${intervalSql}, "createdAt") AS interval_date,
            COUNT("id") AS count
          FROM "PaymentOrder"
          WHERE "status" = 'PAID'
            AND "createdAt" >= ${startDate}
            AND "createdAt" <= ${endDate}
          GROUP BY interval_date
          ORDER BY interval_date ASC
        `;
        data = raw.map((r) => ({
          date: r.interval_date.toISOString(),
          value: Number(r.count),
        }));
        break;
      }
    }

    return {
      interval,
      metric,
      data,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 6. TOTAL REPORT (LEGACY COMPATIBLE & ENRICHED)
  // ─────────────────────────────────────────────────────────────

  async generateTotalReport(): Promise<ReportTotalResponseDto> {
    const [
      totalUsers,
      completedProfiles,
      demographicsGroup,
      totalIdentities,
      claimedIdentities,
      unclaimedIdentities,
      verifiedIdentities,
      identitiesGroup,
      totalDevices,
      activeDevices,
      devicesGroup,
      totalLikes,
      likeStatusGroup,
      likesIdentityRaw,
      likesIntentGroup,
      totalMatches,
      matchStatusGroup,
      totalBlocks,
      creditsGivenAgg,
      creditsGivenGroup,
      creditsUtilisedAgg,
      totalGrossRevenueAgg,
      activeSubscriptionsCount,
      successfulOrdersCount,
      totalChatRooms,
      activeRoomsRaw,
      totalMessages,
      readMessages,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.userProfile.count({
        where: { user: { deletedAt: null } },
      }),
      this.prisma.userProfile.groupBy({
        by: ['gender'],
        where: { user: { deletedAt: null } },
        _count: true,
      }),
      this.prisma.identity.count({ where: { deletedAt: null } }),
      this.prisma.identity.count({
        where: { userId: { not: null }, deletedAt: null },
      }),
      this.prisma.identity.count({
        where: { userId: null, deletedAt: null },
      }),
      this.prisma.identity.count({
        where: { isVerified: true, deletedAt: null },
      }),
      this.prisma.identity.groupBy({
        by: ['type'],
        where: { deletedAt: null },
        _count: true,
      }),
      this.prisma.device.count({ where: { user: { deletedAt: null } } }),
      this.prisma.device.count({
        where: { isActive: true, user: { deletedAt: null } },
      }),
      this.prisma.device.groupBy({
        by: ['platform'],
        where: { user: { deletedAt: null } },
        _count: true,
      }),
      this.prisma.like.count({ where: { deletedAt: null } }),
      this.prisma.like.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: true,
      }),
      this.prisma.$queryRaw<Array<{ type: string; count: bigint }>>`
        SELECT i."type", COUNT(l."id") as count
        FROM "Like" l
        JOIN "Identity" i ON l."targetIdentityId" = i."id"
        WHERE l."deletedAt" IS NULL
        GROUP BY i."type"
      `,
      this.prisma.like.groupBy({
        by: ['intent'],
        where: { deletedAt: null },
        _count: true,
      }),
      this.prisma.match.count({ where: { deletedAt: null } }),
      this.prisma.match.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: true,
      }),
      this.prisma.block.count({ where: { deletedAt: null } }),
      this.prisma.creditLedger.aggregate({
        where: { transactionType: CreditTransactionType.CREDIT },
        _sum: { amount: true },
      }),
      this.prisma.creditLedger.groupBy({
        by: ['source'],
        where: { transactionType: CreditTransactionType.CREDIT },
        _sum: { amount: true },
      }),
      this.prisma.creditLedger.aggregate({
        where: { transactionType: CreditTransactionType.DEBIT },
        _sum: { amount: true },
      }),
      // Additional financial and chat summaries
      this.prisma.transaction.aggregate({
        where: {
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
        },
        _sum: { amount: true },
      }),
      this.prisma.userSubscription.count({
        where: { status: SubscriptionStatus.ACTIVE },
      }),
      this.prisma.paymentOrder.count({
        where: { status: PaymentOrderStatus.PAID },
      }),
      this.prisma.chatRoom.count(),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "roomId") as count FROM "Message"
      `,
      this.prisma.message.count(),
      this.prisma.message.count({ where: { readAt: { not: null } } }),
    ]);

    let male = 0,
      female = 0,
      nonbinary = 0,
      otherGender = 0;
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
      }
    }
    const unknownGender = Math.max(
      0,
      totalUsers - (male + female + nonbinary + otherGender),
    );

    const averageIdentitiesPerUser =
      totalUsers > 0 ? this.round2(totalIdentities / totalUsers) : 0;

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

    const averageDevicesPerUser =
      totalUsers > 0 ? this.round2(totalDevices / totalUsers) : 0;

    let androidDevices = 0,
      iosDevices = 0,
      webDevices = 0;
    for (const group of devicesGroup) {
      if (group.platform === DevicePlatform.ANDROID)
        androidDevices = group._count;
      else if (group.platform === DevicePlatform.IOS) iosDevices = group._count;
      else if (group.platform === DevicePlatform.WEB) webDevices = group._count;
    }

    const averageLikesPerUser =
      totalUsers > 0 ? this.round2(totalLikes / totalUsers) : 0;

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

    const getPerc = (c: number, total: number) =>
      total > 0 ? this.round2((c / total) * 100) : 0;

    let relCount = 0,
      casCount = 0,
      openCount = 0;
    for (const group of likesIntentGroup) {
      if (group.intent === IntentType.RELATIONSHIP) relCount = group._count;
      else if (group.intent === IntentType.CASUAL) casCount = group._count;
      else if (group.intent === IntentType.OPEN) openCount = group._count;
    }

    let pendingLikes = 0,
      matchedLikes = 0,
      voidedLikes = 0,
      withdrawnLikes = 0,
      deletedLikes = 0;
    for (const group of likeStatusGroup) {
      switch (group.status) {
        case LikeStatus.PENDING:
          pendingLikes = group._count;
          break;
        case LikeStatus.MATCHED:
          matchedLikes = group._count;
          break;
        case LikeStatus.VOIDED:
          voidedLikes = group._count;
          break;
        case LikeStatus.WITHDRAWN:
          withdrawnLikes = group._count;
          break;
        case LikeStatus.DELETED:
          deletedLikes = group._count;
          break;
      }
    }

    let activeMatches = 0,
      unmatchedMatches = 0,
      blockedMatches = 0;
    for (const group of matchStatusGroup) {
      switch (group.status) {
        case MatchStatus.ACTIVE:
          activeMatches = group._count;
          break;
        case MatchStatus.UNMATCHED:
          unmatchedMatches = group._count;
          break;
        case MatchStatus.BLOCKED:
          blockedMatches = group._count;
          break;
      }
    }

    const averageMatchesPerUser =
      totalUsers > 0 ? this.round2((totalMatches * 2) / totalUsers) : 0;
    const matchConversionRatePercent =
      totalLikes > 0 ? this.round2(((totalMatches * 2) / totalLikes) * 100) : 0;

    let purchaseCred = 0,
      bonusCred = 0,
      referralCred = 0,
      adminCred = 0,
      likeUsageCred = 0,
      expiredCred = 0,
      subscriptionCred = 0;

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
        case CreditSource.EXPIRED:
          expiredCred = sum;
          break;
        case CreditSource.SUBSCRIPTION:
          subscriptionCred = sum;
          break;
      }
    }

    const totalGivenCredits = creditsGivenAgg._sum.amount || 0;
    const totalUtilisedCredits = creditsUtilisedAgg._sum.amount || 0;
    const circulatingBalance = totalGivenCredits - totalUtilisedCredits;

    const activeRooms =
      activeRoomsRaw.length > 0 ? Number(activeRoomsRaw[0].count) : 0;
    const chatReadRatePercent =
      totalMessages > 0 ? this.round2((readMessages / totalMessages) * 100) : 0;

    return {
      users: {
        total: totalUsers,
        completedProfiles,
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
        claimed: claimedIdentities,
        unclaimed: unclaimedIdentities,
        verified: verifiedIdentities,
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
          web: webDevices,
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
        statusSplit: {
          pending: pendingLikes,
          matched: matchedLikes,
          voided: voidedLikes,
          withdrawn: withdrawnLikes,
          deleted: deletedLikes,
        },
      },
      matches: {
        total: totalMatches,
        averagePerUser: averageMatchesPerUser,
        conversionRatePercent: matchConversionRatePercent,
        statusSplit: {
          active: activeMatches,
          unmatched: unmatchedMatches,
          blocked: blockedMatches,
        },
      },
      blocks: {
        total: totalBlocks,
      },
      credits: {
        given: {
          total: totalGivenCredits,
          splitBySource: {
            purchase: purchaseCred,
            bonus: bonusCred,
            referral: referralCred,
            admin: adminCred,
            likeUsage: likeUsageCred,
            expired: expiredCred,
            subscription: subscriptionCred,
          },
        },
        utilisedTotal: totalUtilisedCredits,
        circulatingBalance,
      },
      financial: {
        totalGrossRevenue: this.round2(
          Number(totalGrossRevenueAgg._sum.amount || 0),
        ),
        activeSubscriptions: activeSubscriptionsCount,
        successfulOrders: successfulOrdersCount,
      },
      chat: {
        totalRooms: totalChatRooms,
        activeRooms,
        totalMessages,
        readRatePercent: chatReadRatePercent,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 7. TIMEFRAME REPORT (LEGACY COMPATIBLE & ENRICHED)
  // ─────────────────────────────────────────────────────────────

  async generateTimeframeReport(
    query: GetReportRequestDto,
  ): Promise<ReportTimeframeResponseDto> {
    const { startDate, endDate } = query;
    const actualEndDate = endDate || new Date();

    const timeframeFilter: Prisma.DateTimeFilter = { lte: actualEndDate };
    if (startDate) {
      timeframeFilter.gte = startDate;
    }

    const [
      acquiredUsers,
      acquiredUsersDemographics,
      createdIdentities,
      claimedIdentities,
      unclaimedIdentities,
      createdIdentitiesGroup,
      registeredDevices,
      devicesGroup,
      likesMade,
      likeStatusGroup,
      likesIntentGroup,
      matchesMade,
      matchStatusGroup,
      blocksMade,
      creditsGivenAgg,
      creditsGivenGroup,
      creditsUtilisedAgg,
      totalGrossRevenueAgg,
      activeSubscriptionsCount,
      successfulOrdersCount,
      totalChatRooms,
      activeRoomsRaw,
      totalMessages,
      readMessages,
    ] = await Promise.all([
      // Users
      this.prisma.user.count({
        where: { deletedAt: null, createdAt: timeframeFilter },
      }),
      this.prisma.userProfile.groupBy({
        by: ['gender'],
        where: {
          user: { deletedAt: null, createdAt: timeframeFilter },
        },
        _count: true,
      }),
      // Identities
      this.prisma.identity.count({
        where: { deletedAt: null, createdAt: timeframeFilter },
      }),
      this.prisma.identity.count({
        where: {
          userId: { not: null },
          deletedAt: null,
          createdAt: timeframeFilter,
        },
      }),
      this.prisma.identity.count({
        where: {
          userId: null,
          deletedAt: null,
          createdAt: timeframeFilter,
        },
      }),
      this.prisma.identity.groupBy({
        by: ['type'],
        where: { deletedAt: null, createdAt: timeframeFilter },
        _count: true,
      }),
      // Devices
      this.prisma.device.count({
        where: { createdAt: timeframeFilter },
      }),
      this.prisma.device.groupBy({
        by: ['platform'],
        where: { createdAt: timeframeFilter },
        _count: true,
      }),
      // Likes
      this.prisma.like.count({
        where: { deletedAt: null, createdAt: timeframeFilter },
      }),
      this.prisma.like.groupBy({
        by: ['status'],
        where: { deletedAt: null, createdAt: timeframeFilter },
        _count: true,
      }),
      this.prisma.like.groupBy({
        by: ['intent'],
        where: { deletedAt: null, createdAt: timeframeFilter },
        _count: true,
      }),
      // Matches
      this.prisma.match.count({
        where: { deletedAt: null, matchedAt: timeframeFilter },
      }),
      this.prisma.match.groupBy({
        by: ['status'],
        where: { deletedAt: null, matchedAt: timeframeFilter },
        _count: true,
      }),
      // Blocks
      this.prisma.block.count({
        where: { deletedAt: null, createdAt: timeframeFilter },
      }),
      // Credits
      this.prisma.creditLedger.aggregate({
        where: {
          transactionType: CreditTransactionType.CREDIT,
          createdAt: timeframeFilter,
        },
        _sum: { amount: true },
      }),
      this.prisma.creditLedger.groupBy({
        by: ['source'],
        where: {
          transactionType: CreditTransactionType.CREDIT,
          createdAt: timeframeFilter,
        },
        _sum: { amount: true },
      }),
      this.prisma.creditLedger.aggregate({
        where: {
          transactionType: CreditTransactionType.DEBIT,
          createdAt: timeframeFilter,
        },
        _sum: { amount: true },
      }),
      // Financial in timeframe
      this.prisma.transaction.aggregate({
        where: {
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          occurredAt: timeframeFilter,
        },
        _sum: { amount: true },
      }),
      this.prisma.userSubscription.count({
        where: {
          status: SubscriptionStatus.ACTIVE,
          createdAt: timeframeFilter,
        },
      }),
      this.prisma.paymentOrder.count({
        where: { status: PaymentOrderStatus.PAID, createdAt: timeframeFilter },
      }),
      // Chats in timeframe
      this.prisma.chatRoom.count({
        where: { createdAt: timeframeFilter },
      }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "roomId") as count FROM "Message"
        WHERE "createdAt" >= ${startDate || new Date(0)} AND "createdAt" <= ${actualEndDate}
      `,
      this.prisma.message.count({
        where: { createdAt: timeframeFilter },
      }),
      this.prisma.message.count({
        where: { readAt: { not: null }, createdAt: timeframeFilter },
      }),
    ]);

    let male = 0,
      female = 0,
      nonbinary = 0,
      otherGender = 0;
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
      }
    }
    const unknownGender = Math.max(
      0,
      acquiredUsers - (male + female + nonbinary + otherGender),
    );

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

    let androidDevices = 0,
      iosDevices = 0,
      webDevices = 0;
    for (const group of devicesGroup) {
      if (group.platform === DevicePlatform.ANDROID)
        androidDevices = group._count;
      else if (group.platform === DevicePlatform.IOS) iosDevices = group._count;
      else if (group.platform === DevicePlatform.WEB) webDevices = group._count;
    }

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

    const getPerc = (c: number, total: number) =>
      total > 0 ? this.round2((c / total) * 100) : 0;

    let relCount = 0,
      casCount = 0,
      openCount = 0;
    for (const group of likesIntentGroup) {
      if (group.intent === IntentType.RELATIONSHIP) relCount = group._count;
      else if (group.intent === IntentType.CASUAL) casCount = group._count;
      else if (group.intent === IntentType.OPEN) openCount = group._count;
    }

    let pendingLikes = 0,
      matchedLikes = 0,
      voidedLikes = 0,
      withdrawnLikes = 0,
      deletedLikes = 0;
    for (const group of likeStatusGroup) {
      switch (group.status) {
        case LikeStatus.PENDING:
          pendingLikes = group._count;
          break;
        case LikeStatus.MATCHED:
          matchedLikes = group._count;
          break;
        case LikeStatus.VOIDED:
          voidedLikes = group._count;
          break;
        case LikeStatus.WITHDRAWN:
          withdrawnLikes = group._count;
          break;
        case LikeStatus.DELETED:
          deletedLikes = group._count;
          break;
      }
    }

    let activeMatches = 0,
      unmatchedMatches = 0,
      blockedMatches = 0;
    for (const group of matchStatusGroup) {
      switch (group.status) {
        case MatchStatus.ACTIVE:
          activeMatches = group._count;
          break;
        case MatchStatus.UNMATCHED:
          unmatchedMatches = group._count;
          break;
        case MatchStatus.BLOCKED:
          blockedMatches = group._count;
          break;
      }
    }

    const matchConversionRatePercent =
      likesMade > 0 ? this.round2(((matchesMade * 2) / likesMade) * 100) : 0;

    let purchaseCred = 0,
      bonusCred = 0,
      referralCred = 0,
      adminCred = 0,
      likeUsageCred = 0,
      expiredCred = 0,
      subscriptionCred = 0;

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
        case CreditSource.EXPIRED:
          expiredCred = sum;
          break;
        case CreditSource.SUBSCRIPTION:
          subscriptionCred = sum;
          break;
      }
    }

    const totalGivenCredits = creditsGivenAgg._sum.amount || 0;
    const totalUtilisedCredits = creditsUtilisedAgg._sum.amount || 0;
    const circulatingBalance = totalGivenCredits - totalUtilisedCredits;

    const averageIdentitiesPerUser =
      acquiredUsers > 0 ? this.round2(createdIdentities / acquiredUsers) : 0;
    const averageDevicesPerUser =
      acquiredUsers > 0 ? this.round2(registeredDevices / acquiredUsers) : 0;
    const averageLikesPerUser =
      acquiredUsers > 0 ? this.round2(likesMade / acquiredUsers) : 0;
    const averageMatchesPerUser =
      acquiredUsers > 0 ? this.round2((matchesMade * 2) / acquiredUsers) : 0;

    const activeRooms =
      activeRoomsRaw.length > 0 ? Number(activeRoomsRaw[0].count) : 0;
    const chatReadRatePercent =
      totalMessages > 0 ? this.round2((readMessages / totalMessages) * 100) : 0;

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
        claimed: claimedIdentities,
        unclaimed: unclaimedIdentities,
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
        registered: registeredDevices,
        averagePerUser: averageDevicesPerUser,
        platformSplit: {
          android: androidDevices,
          ios: iosDevices,
          web: webDevices,
        },
      },
      likes: {
        made: likesMade,
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
        statusSplit: {
          pending: pendingLikes,
          matched: matchedLikes,
          voided: voidedLikes,
          withdrawn: withdrawnLikes,
          deleted: deletedLikes,
        },
      },
      matches: {
        matched: matchesMade,
        averagePerUser: averageMatchesPerUser,
        conversionRatePercent: matchConversionRatePercent,
        statusSplit: {
          active: activeMatches,
          unmatched: unmatchedMatches,
          blocked: blockedMatches,
        },
      },
      blocks: {
        total: blocksMade,
      },
      credits: {
        given: {
          total: totalGivenCredits,
          splitBySource: {
            purchase: purchaseCred,
            bonus: bonusCred,
            referral: referralCred,
            admin: adminCred,
            likeUsage: likeUsageCred,
            expired: expiredCred,
            subscription: subscriptionCred,
          },
        },
        utilisedTotal: totalUtilisedCredits,
        circulatingBalance,
      },
      financial: {
        totalGrossRevenue: this.round2(
          Number(totalGrossRevenueAgg._sum.amount || 0),
        ),
        activeSubscriptions: activeSubscriptionsCount,
        successfulOrders: successfulOrdersCount,
      },
      chat: {
        totalRooms: totalChatRooms,
        activeRooms,
        totalMessages,
        readRatePercent: chatReadRatePercent,
      },
    };
  }
}
