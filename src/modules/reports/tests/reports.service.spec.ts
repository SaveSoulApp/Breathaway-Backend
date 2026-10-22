import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
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
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';

import {
  GetReportRequestDto,
  GetReportTrendsRequestDto,
  ReportTrendInterval,
  ReportTrendMetric,
} from '../dto';
import { ReportsService } from '../reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: MockPrismaService;

  const loggerServiceMock = {
    forContext: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
    }),
  } as unknown as jest.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSummaryReport', () => {
    it('should generate executive KPI summary report with rounded banner metrics', async () => {
      prisma.user.count.mockResolvedValue(100);
      (prisma.userSession.findMany as jest.Mock).mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u2' },
        { userId: 'u3' },
      ]);
      prisma.userProfile.count.mockResolvedValue(80);
      (prisma.transaction.aggregate as jest.Mock)
        .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(25000) } })
        .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(8000) } });
      prisma.userSubscription.count.mockResolvedValue(20);
      prisma.paymentOrder.count.mockResolvedValue(45);
      prisma.like.count
        .mockResolvedValueOnce(300) // totalLikesSent
        .mockResolvedValueOnce(120) // pendingLikes
        .mockResolvedValueOnce(40); // viralPendingLikesCount
      prisma.match.count.mockResolvedValue(50);
      prisma.identity.count
        .mockResolvedValueOnce(180) // claimedIdentities
        .mockResolvedValueOnce(50); // unclaimedIdentities
      prisma.message.count
        .mockResolvedValueOnce(400) // totalMessages
        .mockResolvedValueOnce(350); // readMessages
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        { count: BigInt(35) },
      ]);

      const result = await service.getSummaryReport({});

      expect(result.users.total).toBe(100);
      expect(result.users.active30d).toBe(3);
      expect(result.users.completedProfiles).toBe(80);
      expect(result.users.completionRatePercent).toBe(80.0);

      expect(result.financial.totalGrossRevenue).toBe(25000);
      expect(result.financial.periodRevenue).toBe(8000);
      expect(result.financial.activeSubscriptionsCount).toBe(20);
      expect(result.financial.successfulOrdersCount).toBe(45);

      expect(result.engagement.totalLikesSent).toBe(300);
      expect(result.engagement.pendingLikes).toBe(120);
      expect(result.engagement.totalMatches).toBe(50);
      expect(result.engagement.matchConversionRatePercent).toBe(33.33);

      expect(result.viral.claimedIdentities).toBe(180);
      expect(result.viral.unclaimedIdentities).toBe(50);
      expect(result.viral.viralPendingLikesCount).toBe(40);
      expect(result.viral.viralClaimRatePercent).toBe(78.26);

      expect(result.chat.totalMessages).toBe(400);
      expect(result.chat.activeRoomsCount).toBe(35);
      expect(result.chat.readRatePercent).toBe(87.5);
    });
  });

  describe('getUsersReport', () => {
    it('should generate user demographics with unknown gender fallback, age brackets, geography, and devices', async () => {
      prisma.user.count.mockResolvedValue(100);
      (prisma.userSession.findMany as jest.Mock).mockResolvedValue([
        { userId: 'u1' },
      ]);
      prisma.userProfile.count.mockResolvedValue(80);
      (prisma.userProfile.groupBy as jest.Mock).mockResolvedValue([
        { gender: GenderType.MALE, _count: 45 },
        { gender: GenderType.FEMALE, _count: 30 },
        { gender: GenderType.NONBINARY, _count: 3 },
        { gender: GenderType.OTHER, _count: 1 },
      ]);
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          { bracket: 'age18To24', count: BigInt(20) },
          { bracket: 'age25To34', count: BigInt(45) },
          { bracket: 'age35To44', count: BigInt(10) },
          { bracket: 'age45Plus', count: BigInt(5) },
        ])
        .mockResolvedValueOnce([
          { countryCode: 'IN', count: BigInt(80) },
          { countryCode: 'US', count: BigInt(20) },
        ])
        .mockResolvedValueOnce([
          { platform: 'IOS', version: '1.2.0', count: BigInt(30) },
          { platform: 'ANDROID', version: '1.1.0', count: BigInt(50) },
        ]);

      prisma.device.count.mockResolvedValueOnce(110).mockResolvedValueOnce(90);
      (prisma.device.groupBy as jest.Mock).mockResolvedValue([
        { platform: DevicePlatform.ANDROID, _count: 60 },
        { platform: DevicePlatform.IOS, _count: 40 },
        { platform: DevicePlatform.WEB, _count: 10 },
      ]);

      const result = await service.getUsersReport({});

      expect(result.total).toBe(100);
      expect(result.active30d).toBe(1);
      expect(result.demographics.gender.male).toBe(45);
      expect(result.demographics.gender.unknown).toBe(21); // 100 - (45 + 30 + 3 + 1)
      expect(result.demographics.ageBrackets.age25To34).toBe(45);
      expect(result.demographics.ageBrackets.unknown).toBe(20); // 100 - (20 + 45 + 10 + 5)
      expect(result.geography).toHaveLength(2);
      expect(result.geography[0].countryCode).toBe('IN');
      expect(result.devices.platformSplit.web).toBe(10);
      expect(result.devices.appVersions).toHaveLength(2);
    });
  });

  describe('getEngagementReport', () => {
    it('should generate engagement report with identities, likes status funnel, matches, chats, and safety', async () => {
      prisma.user.count.mockResolvedValue(100);
      prisma.identity.count
        .mockResolvedValueOnce(200) // total
        .mockResolvedValueOnce(150) // claimed
        .mockResolvedValueOnce(50) // unclaimed
        .mockResolvedValueOnce(120); // verified
      prisma.like.count
        .mockResolvedValueOnce(25) // viralPendingLikes
        .mockResolvedValueOnce(300); // totalLikes
      (prisma.identity.groupBy as jest.Mock).mockResolvedValue([
        { type: IdentityType.PHONE, _count: 100 },
        { type: IdentityType.INSTAGRAM, _count: 100 },
      ]);
      (prisma.like.groupBy as jest.Mock)
        .mockResolvedValueOnce([
          { status: LikeStatus.PENDING, _count: 120 },
          { status: LikeStatus.MATCHED, _count: 100 },
          { status: LikeStatus.VOIDED, _count: 40 },
          { status: LikeStatus.WITHDRAWN, _count: 30 },
          { status: LikeStatus.DELETED, _count: 10 },
        ])
        .mockResolvedValueOnce([
          { intent: IntentType.RELATIONSHIP, _count: 180 },
          { intent: IntentType.CASUAL, _count: 90 },
          { intent: IntentType.OPEN, _count: 30 },
        ]);
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          { type: IdentityType.INSTAGRAM, count: BigInt(150) },
          { type: IdentityType.PHONE, count: BigInt(150) },
        ])
        .mockResolvedValueOnce([
          { pairing: 'relationshipRelationship', count: BigInt(25) },
          { pairing: 'casualCasual', count: BigInt(15) },
        ])
        .mockResolvedValueOnce([{ count: BigInt(30) }]); // activeRoomsRaw

      prisma.match.count.mockResolvedValue(50);
      (prisma.match.groupBy as jest.Mock).mockResolvedValue([
        { status: MatchStatus.ACTIVE, _count: 40 },
        { status: MatchStatus.UNMATCHED, _count: 8 },
        { status: MatchStatus.BLOCKED, _count: 2 },
      ]);
      prisma.chatRoom.count.mockResolvedValue(50);
      prisma.message.count
        .mockResolvedValueOnce(300)
        .mockResolvedValueOnce(250);
      prisma.block.count
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2);

      const result = await service.getEngagementReport({});

      expect(result.identities.total).toBe(200);
      expect(result.identities.claimed).toBe(150);
      expect(result.identities.unclaimed).toBe(50);
      expect(result.likes.statusSplit.pending).toBe(120);
      expect(result.likes.statusSplit.matched).toBe(100);
      expect(result.matches.statusSplit.active).toBe(40);
      expect(result.matches.mutualIntentSplit.relationshipRelationship).toBe(
        25,
      );
      expect(result.chats.totalMessages).toBe(300);
      expect(result.safety.totalBlocks).toBe(12);
    });
  });

  describe('getFinancialReport', () => {
    it('should generate financial report covering currencies, gateways, channels, orders, and subscriptions', async () => {
      (prisma.transaction.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(15000) },
      });
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          {
            currency: 'INR',
            amount: new Prisma.Decimal(15000),
            count: BigInt(50),
          },
        ])
        .mockResolvedValueOnce([
          {
            planId: 'p1',
            slug: 'pro-monthly',
            name: 'Pro Monthly',
            activeSubscribers: BigInt(20),
          },
        ]);
      (prisma.transaction.groupBy as jest.Mock)
        .mockResolvedValueOnce([
          {
            channel: TransactionChannel.IOS,
            _sum: { amount: new Prisma.Decimal(9000) },
          },
          {
            channel: TransactionChannel.ANDROID,
            _sum: { amount: new Prisma.Decimal(4000) },
          },
          {
            channel: TransactionChannel.WEB,
            _sum: { amount: new Prisma.Decimal(2000) },
          },
        ])
        .mockResolvedValueOnce([
          {
            gateway: PaymentGateway.REVENUECAT,
            _sum: { amount: new Prisma.Decimal(13000) },
          },
          {
            gateway: PaymentGateway.RAZORPAY,
            _sum: { amount: new Prisma.Decimal(2000) },
          },
        ]);
      (prisma.paymentOrder.groupBy as jest.Mock).mockResolvedValue([
        { status: PaymentOrderStatus.PAID, _count: 45 },
        { status: PaymentOrderStatus.FAILED, _count: 5 },
      ]);
      prisma.paymentOrder.count.mockResolvedValue(50);
      (prisma.userSubscription.groupBy as jest.Mock)
        .mockResolvedValueOnce([
          { status: SubscriptionStatus.ACTIVE, _count: 20 },
          { status: SubscriptionStatus.CANCELLED, _count: 3 },
        ])
        .mockResolvedValueOnce([
          { storePlatform: StorePlatform.APPLE, _count: 15 },
          { storePlatform: StorePlatform.GOOGLE, _count: 5 },
        ]);
      (prisma.creditLedger.aggregate as jest.Mock)
        .mockResolvedValueOnce({ _sum: { amount: 1000 } })
        .mockResolvedValueOnce({ _sum: { amount: 400 } });
      (prisma.creditLedger.groupBy as jest.Mock).mockResolvedValue([
        { source: CreditSource.PURCHASE, _sum: { amount: 600 } },
        { source: CreditSource.BONUS, _sum: { amount: 200 } },
        { source: CreditSource.REFERRAL, _sum: { amount: 100 } },
        { source: CreditSource.ADMIN, _sum: { amount: 50 } },
        { source: CreditSource.SUBSCRIPTION, _sum: { amount: 50 } },
      ]);

      const result = await service.getFinancialReport({});

      expect(result.revenue.totalGross).toBe(15000);
      expect(result.revenue.channelSplit.ios).toBe(9000);
      expect(result.revenue.gatewaySplit.revenuecat).toBe(13000);
      expect(result.orders.successRatePercent).toBe(90.0);
      expect(result.subscriptions.totalActive).toBe(20);
      expect(result.subscriptions.platformSplit.apple).toBe(15);
      expect(result.credits.circulatingBalance).toBe(600);
    });
  });

  describe('getTrendsReport', () => {
    it('should aggregate time-series users trends for line/bar charts', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        {
          interval_date: new Date('2026-10-01T00:00:00.000Z'),
          count: BigInt(15),
        },
        {
          interval_date: new Date('2026-10-02T00:00:00.000Z'),
          count: BigInt(25),
        },
      ]);

      const result = await service.getTrendsReport({
        interval: ReportTrendInterval.DAY,
        metric: ReportTrendMetric.USERS,
      });

      expect(result.interval).toBe(ReportTrendInterval.DAY);
      expect(result.metric).toBe(ReportTrendMetric.USERS);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].value).toBe(15);
      expect(result.data[1].value).toBe(25);
    });

    it('should aggregate time-series revenue trends', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        {
          interval_date: new Date('2026-10-01T00:00:00.000Z'),
          revenue: new Prisma.Decimal(500),
        },
      ]);

      const result = await service.getTrendsReport({
        interval: ReportTrendInterval.DAY,
        metric: ReportTrendMetric.REVENUE,
      });

      expect(result.metric).toBe(ReportTrendMetric.REVENUE);
      expect(result.data[0].value).toBe(500);
    });
  });

  describe('generateTotalReport', () => {
    it('should generate an enriched total report rounded to 2 decimal places with unknown demographics fallback', async () => {
      prisma.user.count.mockResolvedValue(100);
      prisma.userProfile.count.mockResolvedValue(80);
      (prisma.userProfile.groupBy as jest.Mock).mockResolvedValue([
        { gender: GenderType.MALE, _count: 40 },
        { gender: GenderType.FEMALE, _count: 30 },
        { gender: GenderType.NONBINARY, _count: 5 },
        { gender: GenderType.OTHER, _count: 3 },
      ]);

      prisma.identity.count
        .mockResolvedValueOnce(200) // totalIdentities
        .mockResolvedValueOnce(150) // claimedIdentities
        .mockResolvedValueOnce(50) // unclaimedIdentities
        .mockResolvedValueOnce(120); // verifiedIdentities

      (prisma.identity.groupBy as jest.Mock).mockResolvedValue([
        { type: IdentityType.INSTAGRAM, _count: 60 },
        { type: IdentityType.PHONE, _count: 50 },
        { type: IdentityType.EMAIL, _count: 40 },
        { type: IdentityType.LINKEDIN, _count: 20 },
        { type: IdentityType.TWITTER, _count: 15 },
        { type: IdentityType.OTHER, _count: 15 },
      ]);

      prisma.device.count.mockResolvedValueOnce(150).mockResolvedValueOnce(120);
      (prisma.device.groupBy as jest.Mock).mockResolvedValue([
        { platform: DevicePlatform.ANDROID, _count: 90 },
        { platform: DevicePlatform.IOS, _count: 50 },
        { platform: DevicePlatform.WEB, _count: 10 },
      ]);

      prisma.like.count.mockResolvedValue(300);
      (prisma.like.groupBy as jest.Mock)
        .mockResolvedValueOnce([
          { status: LikeStatus.PENDING, _count: 150 },
          { status: LikeStatus.MATCHED, _count: 100 },
          { status: LikeStatus.VOIDED, _count: 30 },
          { status: LikeStatus.WITHDRAWN, _count: 15 },
          { status: LikeStatus.DELETED, _count: 5 },
        ])
        .mockResolvedValueOnce([
          { intent: IntentType.RELATIONSHIP, _count: 180 },
          { intent: IntentType.CASUAL, _count: 90 },
          { intent: IntentType.OPEN, _count: 30 },
        ]);

      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          { type: IdentityType.INSTAGRAM, count: BigInt(100) },
          { type: IdentityType.PHONE, count: BigInt(80) },
          { type: IdentityType.EMAIL, count: BigInt(50) },
          { type: IdentityType.LINKEDIN, count: BigInt(30) },
          { type: IdentityType.TWITTER, count: BigInt(20) },
          { type: IdentityType.OTHER, count: BigInt(20) },
        ])
        .mockResolvedValueOnce([{ count: BigInt(15) }]); // activeRoomsRaw

      prisma.match.count.mockResolvedValue(50);
      (prisma.match.groupBy as jest.Mock).mockResolvedValue([
        { status: MatchStatus.ACTIVE, _count: 45 },
        { status: MatchStatus.UNMATCHED, _count: 3 },
        { status: MatchStatus.BLOCKED, _count: 2 },
      ]);
      prisma.block.count.mockResolvedValue(10);

      (prisma.creditLedger.aggregate as jest.Mock)
        .mockResolvedValueOnce({ _sum: { amount: 1000 } })
        .mockResolvedValueOnce({ _sum: { amount: 600 } });

      (prisma.creditLedger.groupBy as jest.Mock).mockResolvedValue([
        { source: CreditSource.PURCHASE, _sum: { amount: 500 } },
        { source: CreditSource.BONUS, _sum: { amount: 200 } },
        { source: CreditSource.REFERRAL, _sum: { amount: 150 } },
        { source: CreditSource.ADMIN, _sum: { amount: 100 } },
        { source: CreditSource.LIKE_USAGE, _sum: { amount: 50 } },
      ]);

      (prisma.transaction.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(15000) },
      });
      prisma.userSubscription.count.mockResolvedValue(20);
      prisma.paymentOrder.count.mockResolvedValue(45);
      prisma.chatRoom.count.mockResolvedValue(25);
      prisma.message.count
        .mockResolvedValueOnce(200)
        .mockResolvedValueOnce(180);

      const result = await service.generateTotalReport();

      expect(result.users.total).toBe(100);
      expect(result.users.completedProfiles).toBe(80);
      expect(result.users.demographics.unknown).toBe(22); // 100 - (40+30+5+3)
      expect(result.identities.claimed).toBe(150);
      expect(result.identities.unclaimed).toBe(50);
      expect(result.identities.averagePerUser).toBe(2.0);
      expect(result.devices.platformSplit.web).toBe(10);
      expect(result.devices.averagePerUser).toBe(1.5);
      expect(result.likes.averagePerUser).toBe(3.0);
      expect(result.likes.statusSplit?.pending).toBe(150);
      expect(result.matches.averagePerUser).toBe(1.0); // (50 * 2) / 100
      expect(result.matches.conversionRatePercent).toBe(33.33); // (100 / 300) * 100
      expect(result.matches.statusSplit?.active).toBe(45);
      expect(result.credits.given.total).toBe(1000);
      expect(result.credits.utilisedTotal).toBe(600);
      expect(result.credits.circulatingBalance).toBe(400);
      expect(result.financial?.totalGrossRevenue).toBe(15000);
      expect(result.chat?.totalRooms).toBe(25);
    });
  });

  describe('generateTimeframeReport', () => {
    it('should generate timeframe report with timeframe filters and rounded values', async () => {
      const query: GetReportRequestDto = {
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-31T23:59:59.999Z'),
      };

      prisma.user.count.mockResolvedValue(20);
      (prisma.userProfile.groupBy as jest.Mock).mockResolvedValue([
        { gender: GenderType.MALE, _count: 10 },
        { gender: GenderType.FEMALE, _count: 8 },
      ]);

      prisma.identity.count
        .mockResolvedValueOnce(30) // created
        .mockResolvedValueOnce(20) // claimed
        .mockResolvedValueOnce(10); // unclaimed
      (prisma.identity.groupBy as jest.Mock).mockResolvedValue([
        { type: IdentityType.INSTAGRAM, _count: 15 },
        { type: IdentityType.PHONE, _count: 15 },
      ]);

      prisma.device.count.mockResolvedValue(25);
      (prisma.device.groupBy as jest.Mock).mockResolvedValue([
        { platform: DevicePlatform.ANDROID, _count: 15 },
        { platform: DevicePlatform.IOS, _count: 10 },
      ]);

      prisma.like.count.mockResolvedValue(50);
      (prisma.like.groupBy as jest.Mock)
        .mockResolvedValueOnce([
          { status: LikeStatus.PENDING, _count: 30 },
          { status: LikeStatus.MATCHED, _count: 20 },
        ])
        .mockResolvedValueOnce([
          { intent: IntentType.RELATIONSHIP, _count: 30 },
          { intent: IntentType.CASUAL, _count: 20 },
        ]);

      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          { type: IdentityType.INSTAGRAM, count: BigInt(25) },
          { type: IdentityType.PHONE, count: BigInt(25) },
        ])
        .mockResolvedValueOnce([{ count: BigInt(5) }]); // activeRoomsRaw

      prisma.match.count.mockResolvedValue(10);
      (prisma.match.groupBy as jest.Mock).mockResolvedValue([
        { status: MatchStatus.ACTIVE, _count: 10 },
      ]);
      prisma.block.count.mockResolvedValue(2);

      (prisma.creditLedger.aggregate as jest.Mock)
        .mockResolvedValueOnce({ _sum: { amount: 200 } })
        .mockResolvedValueOnce({ _sum: { amount: 100 } });

      (prisma.creditLedger.groupBy as jest.Mock).mockResolvedValue([
        { source: CreditSource.PURCHASE, _sum: { amount: 150 } },
        { source: CreditSource.BONUS, _sum: { amount: 50 } },
      ]);

      (prisma.transaction.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(2500) },
      });
      prisma.userSubscription.count.mockResolvedValue(5);
      prisma.paymentOrder.count.mockResolvedValue(8);
      prisma.chatRoom.count.mockResolvedValue(10);
      prisma.message.count.mockResolvedValueOnce(50).mockResolvedValueOnce(45);

      const result = await service.generateTimeframeReport(query);

      expect(result.users.acquired).toBe(20);
      expect(result.users.demographics.unknown).toBe(2); // 20 - (10 + 8)
      expect(result.identities.claimed).toBe(20);
      expect(result.identities.unclaimed).toBe(10);
      expect(result.identities.averagePerUser).toBe(1.5); // 30 / 20
      expect(result.devices.averagePerUser).toBe(1.25); // 25 / 20
      expect(result.likes.made).toBe(50);
      expect(result.likes.averagePerUser).toBe(2.5); // 50 / 20
      expect(result.likes.statusSplit?.pending).toBe(30);
      expect(result.matches.matched).toBe(10);
      expect(result.matches.averagePerUser).toBe(1.0); // (10 * 2) / 20
      expect(result.matches.conversionRatePercent).toBe(40.0); // (20 / 50) * 100
      expect(result.matches.statusSplit?.active).toBe(10);
      expect(result.credits.given.total).toBe(200);
      expect(result.credits.circulatingBalance).toBe(100);
      expect(result.financial?.totalGrossRevenue).toBe(2500);
      expect(result.chat?.totalRooms).toBe(10);
    });
  });
});
