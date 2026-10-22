import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { AdminOidcAuthGuard } from '@modules/admin/guards/admin-oidc-auth.guard';

import {
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
} from '../dto';
import { ReportsController } from '../reports.controller';
import { ReportsService } from '../reports.service';

describe('ReportsController', () => {
  let controller: ReportsController;
  let service: jest.Mocked<ReportsService>;

  const mockSummaryReport = {
    users: {
      total: 100,
      active30d: 40,
      completedProfiles: 80,
      completionRatePercent: 80,
    },
    financial: {
      totalGrossRevenue: 15000,
      periodRevenue: 5000,
      activeSubscriptionsCount: 25,
      successfulOrdersCount: 45,
    },
    engagement: {
      totalLikesSent: 300,
      pendingLikes: 120,
      totalMatches: 50,
      matchConversionRatePercent: 33.3,
    },
    viral: {
      claimedIdentities: 180,
      unclaimedIdentities: 50,
      viralPendingLikesCount: 30,
      viralClaimRatePercent: 78.3,
    },
    chat: {
      totalMessages: 400,
      activeRoomsCount: 35,
      readRatePercent: 88.5,
    },
  } as ReportSummaryResponseDto;

  const mockUsersReport = {
    total: 100,
    active30d: 40,
    completedProfiles: 80,
    demographics: {
      gender: {
        male: 50,
        female: 40,
        nonbinary: 5,
        other: 3,
        unknown: 2,
      },
      ageBrackets: {
        age18To24: 30,
        age25To34: 50,
        age35To44: 15,
        age45Plus: 5,
        unknown: 0,
      },
    },
    geography: [{ countryCode: 'IN', count: 85, percentage: 85 }],
    devices: {
      total: 120,
      active: 95,
      platformSplit: { android: 70, ios: 40, web: 10 },
      appVersions: [{ platform: 'IOS', version: '1.2.0', count: 35 }],
    },
  } as ReportUsersResponseDto;

  const mockEngagementReport = {
    identities: {
      total: 230,
      claimed: 180,
      unclaimed: 50,
      verified: 160,
      viralPendingLikes: 30,
      split: {
        instagram: 80,
        phone: 70,
        email: 40,
        linkedin: 20,
        twitter: 10,
        other: 10,
      },
    },
    likes: {
      total: 300,
      averagePerUser: 3,
      statusSplit: {
        pending: 120,
        matched: 100,
        voided: 40,
        withdrawn: 30,
        deleted: 10,
      },
      intentSplit: {
        relationship: { count: 180, percentage: 60 },
        casual: { count: 90, percentage: 30 },
        open: { count: 30, percentage: 10 },
      },
      targetIdentitySplit: {
        instagram: 150,
        phone: 90,
        email: 30,
        linkedin: 15,
        twitter: 10,
        other: 5,
      },
    },
    matches: {
      total: 50,
      conversionRatePercent: 33.3,
      statusSplit: { active: 40, unmatched: 8, blocked: 2 },
      mutualIntentSplit: {
        relationshipRelationship: 25,
        casualCasual: 15,
        openOpen: 5,
        mixed: 5,
      },
    },
    chats: {
      totalRooms: 50,
      activeRooms: 35,
      totalMessages: 400,
      readRatePercent: 88.5,
      averageMessagesPerActiveRoom: 11.4,
    },
    safety: {
      totalBlocks: 10,
      directUserBlocks: 8,
      phoneHashBlocks: 2,
    },
  } as ReportEngagementResponseDto;

  const mockFinancialReport = {
    revenue: {
      totalGross: 15000,
      currencies: [{ currency: 'INR', amount: 15000, count: 45 }],
      channelSplit: { ios: 8000, android: 5000, web: 2000 },
      gatewaySplit: {
        revenuecat: 13000,
        razorpay: 1500,
        cashfree: 500,
        easebuzz: 0,
        decentro: 0,
      },
    },
    orders: {
      totalOrders: 60,
      paid: 45,
      failed: 10,
      expired: 4,
      refunded: 1,
      successRatePercent: 75.0,
    },
    subscriptions: {
      totalActive: 25,
      trial: 5,
      gracePeriod: 2,
      cancelled: 3,
      expired: 8,
      platformSplit: { apple: 18, google: 7 },
      planSplit: [
        {
          planId: 'plan-1',
          slug: 'premium-monthly',
          name: 'Monthly Premium',
          activeSubscribers: 25,
        },
      ],
    },
    credits: {
      given: {
        total: 1000,
        splitBySource: {
          purchase: 600,
          bonus: 200,
          referral: 100,
          admin: 50,
          likeUsage: 0,
          expired: 0,
          subscription: 50,
        },
      },
      utilisedTotal: 400,
      circulatingBalance: 600,
    },
  } as ReportFinancialResponseDto;

  const mockTrendsReport = {
    interval: 'day',
    metric: 'users',
    data: [
      { date: '2026-10-01T00:00:00.000Z', value: 12 },
      { date: '2026-10-02T00:00:00.000Z', value: 18 },
    ],
  } as ReportTrendsResponseDto;

  const mockTotalReport = {
    users: {
      total: 100,
      completedProfiles: 80,
      demographics: {
        male: 50,
        female: 40,
        nonbinary: 5,
        other: 3,
        unknown: 2,
      },
    },
    identities: {
      total: 150,
      averagePerUser: 1.5,
      split: {
        instagram: 60,
        phone: 50,
        email: 30,
        linkedin: 5,
        twitter: 3,
        other: 2,
      },
    },
    devices: {
      total: 120,
      active: 90,
      averagePerUser: 1.2,
      platformSplit: {
        android: 70,
        ios: 40,
        web: 10,
      },
    },
    likes: {
      total: 200,
      averagePerUser: 2,
      targetIdentitySplit: {
        instagram: 100,
        phone: 60,
        email: 20,
        linkedin: 10,
        twitter: 5,
        other: 5,
      },
      intentSplit: {
        relationship: { count: 120, percentage: 60 },
        casual: { count: 50, percentage: 25 },
        open: { count: 30, percentage: 15 },
      },
      statusSplit: {
        pending: 80,
        matched: 80,
        voided: 20,
        withdrawn: 15,
        deleted: 5,
      },
    },
    matches: {
      total: 40,
      averagePerUser: 0.8,
      statusSplit: {
        active: 35,
        unmatched: 3,
        blocked: 2,
      },
    },
    blocks: {
      total: 5,
    },
    credits: {
      given: {
        total: 500,
        splitBySource: {
          purchase: 300,
          bonus: 100,
          referral: 50,
          admin: 30,
          likeUsage: 20,
          expired: 0,
          subscription: 0,
        },
      },
      utilisedTotal: 250,
    },
  } as ReportTotalResponseDto;

  const mockTimeframeReport = {
    timeframe: {
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-31T23:59:59.999Z'),
    },
    users: {
      acquired: 20,
      demographics: {
        male: 10,
        female: 8,
        nonbinary: 1,
        other: 1,
        unknown: 0,
      },
    },
    identities: {
      created: 30,
      split: {
        instagram: 15,
        phone: 10,
        email: 5,
        linkedin: 0,
        twitter: 0,
        other: 0,
      },
    },
    devices: {
      registered: 25,
      platformSplit: {
        android: 15,
        ios: 10,
        web: 0,
      },
    },
    likes: {
      made: 50,
      targetIdentitySplit: {
        instagram: 25,
        phone: 15,
        email: 5,
        linkedin: 2,
        twitter: 2,
        other: 1,
      },
      intentSplit: {
        relationship: { count: 30, percentage: 60 },
        casual: { count: 15, percentage: 30 },
        open: { count: 5, percentage: 10 },
      },
      statusSplit: {
        pending: 20,
        matched: 20,
        voided: 5,
        withdrawn: 3,
        deleted: 2,
      },
    },
    matches: {
      matched: 10,
      statusSplit: {
        active: 8,
        unmatched: 1,
        blocked: 1,
      },
    },
    blocks: {
      total: 2,
    },
    credits: {
      given: {
        total: 100,
        splitBySource: {
          purchase: 60,
          bonus: 20,
          referral: 10,
          admin: 10,
          likeUsage: 0,
          expired: 0,
          subscription: 0,
        },
      },
      utilisedTotal: 50,
    },
  } as ReportTimeframeResponseDto;

  beforeEach(async () => {
    const mockReportsService = {
      getSummaryReport: jest.fn(),
      getUsersReport: jest.fn(),
      getEngagementReport: jest.fn(),
      getFinancialReport: jest.fn(),
      getTrendsReport: jest.fn(),
      generateTotalReport: jest.fn(),
      generateTimeframeReport: jest.fn(),
    };

    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ReportsService, useValue: mockReportsService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    })
      .overrideGuard(AdminOidcAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<ReportsController>(ReportsController);
    service = module.get(ReportsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSummary', () => {
    it('should delegate to reportsService.getSummaryReport and return summary report', async () => {
      const query: GetReportRequestDto = {};
      service.getSummaryReport.mockResolvedValue(mockSummaryReport);

      const result = await controller.getSummary(query);

      expect(service.getSummaryReport).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockSummaryReport);
    });
  });

  describe('getUsersReport', () => {
    it('should delegate to reportsService.getUsersReport and return user demographics report', async () => {
      const query: GetReportRequestDto = {};
      service.getUsersReport.mockResolvedValue(mockUsersReport);

      const result = await controller.getUsersReport(query);

      expect(service.getUsersReport).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockUsersReport);
    });
  });

  describe('getEngagementReport', () => {
    it('should delegate to reportsService.getEngagementReport and return engagement report', async () => {
      const query: GetReportRequestDto = {};
      service.getEngagementReport.mockResolvedValue(mockEngagementReport);

      const result = await controller.getEngagementReport(query);

      expect(service.getEngagementReport).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockEngagementReport);
    });
  });

  describe('getFinancialReport', () => {
    it('should delegate to reportsService.getFinancialReport and return financial report', async () => {
      const query: GetReportRequestDto = {};
      service.getFinancialReport.mockResolvedValue(mockFinancialReport);

      const result = await controller.getFinancialReport(query);

      expect(service.getFinancialReport).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockFinancialReport);
    });
  });

  describe('getTrends', () => {
    it('should delegate to reportsService.getTrendsReport and return trend time-series', async () => {
      const query: GetReportTrendsRequestDto = {
        interval: ReportTrendInterval.DAY,
        metric: ReportTrendMetric.USERS,
      };
      service.getTrendsReport.mockResolvedValue(mockTrendsReport);

      const result = await controller.getTrends(query);

      expect(service.getTrendsReport).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockTrendsReport);
    });
  });

  describe('getTotalReport', () => {
    it('should delegate to reportsService.generateTotalReport and return total report', async () => {
      service.generateTotalReport.mockResolvedValue(mockTotalReport);

      const result = await controller.getTotalReport();

      expect(service.generateTotalReport).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockTotalReport);
    });
  });

  describe('getTimeframeReport', () => {
    it('should delegate to reportsService.generateTimeframeReport with query and return timeframe report', async () => {
      const query: GetReportRequestDto = {
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-31T23:59:59.999Z'),
      };
      service.generateTimeframeReport.mockResolvedValue(mockTimeframeReport);

      const result = await controller.getTimeframeReport(query);

      expect(service.generateTimeframeReport).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockTimeframeReport);
    });
  });
});
