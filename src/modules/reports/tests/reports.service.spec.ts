import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CreditSource,
  CreditTransactionType,
  DevicePlatform,
  GenderType,
  IdentityType,
  IntentType,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';

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

  describe('generateTotalReport', () => {
    it('should generate a comprehensive total report with all demographics, sources, and platforms', async () => {
      // Arrange
      prisma.user.count.mockResolvedValue(100);
      prisma.userProfile.count.mockResolvedValue(80);
      (prisma.userProfile.groupBy as jest.Mock).mockResolvedValue([
        { gender: GenderType.MALE, _count: 40 },
        { gender: GenderType.FEMALE, _count: 30 },
        { gender: GenderType.NONBINARY, _count: 5 },
        { gender: GenderType.OTHER, _count: 3 },
        { gender: null, _count: 2 },
      ]);

      prisma.identity.count.mockResolvedValue(200);
      (prisma.identity.groupBy as jest.Mock).mockResolvedValue([
        { type: IdentityType.INSTAGRAM, _count: 60 },
        { type: IdentityType.PHONE, _count: 50 },
        { type: IdentityType.EMAIL, _count: 40 },
        { type: IdentityType.LINKEDIN, _count: 20 },
        { type: IdentityType.TWITTER, _count: 15 },
        { type: IdentityType.OTHER, _count: 15 },
      ]);

      prisma.device.count
        .mockResolvedValueOnce(150) // totalDevices
        .mockResolvedValueOnce(120); // activeDevices
      (prisma.device.groupBy as jest.Mock).mockResolvedValue([
        { platform: DevicePlatform.ANDROID, _count: 90 },
        { platform: DevicePlatform.IOS, _count: 60 },
      ]);

      prisma.like.count.mockResolvedValue(300);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        { type: IdentityType.INSTAGRAM, count: BigInt(100) },
        { type: IdentityType.PHONE, count: BigInt(80) },
        { type: IdentityType.EMAIL, count: BigInt(50) },
        { type: IdentityType.LINKEDIN, count: BigInt(30) },
        { type: IdentityType.TWITTER, count: BigInt(20) },
        { type: IdentityType.OTHER, count: BigInt(20) },
      ]);
      (prisma.like.groupBy as jest.Mock).mockResolvedValue([
        { intent: IntentType.RELATIONSHIP, _count: 180 },
        { intent: IntentType.CASUAL, _count: 90 },
        { intent: IntentType.OPEN, _count: 30 },
      ]);

      prisma.match.count.mockResolvedValue(50);
      prisma.block.count.mockResolvedValue(10);

      (prisma.creditLedger.aggregate as jest.Mock)
        .mockResolvedValueOnce({ _sum: { amount: 1000 } }) // creditsGivenAgg
        .mockResolvedValueOnce({ _sum: { amount: 600 } }); // creditsUtilisedAgg

      (prisma.creditLedger.groupBy as jest.Mock).mockResolvedValue([
        { source: CreditSource.PURCHASE, _sum: { amount: 500 } },
        { source: CreditSource.BONUS, _sum: { amount: 200 } },
        { source: CreditSource.REFERRAL, _sum: { amount: 150 } },
        { source: CreditSource.ADMIN, _sum: { amount: 100 } },
        { source: CreditSource.LIKE_USAGE, _sum: { amount: 50 } },
      ]);

      // Act
      const result = await service.generateTotalReport();

      // Assert
      expect(result.users.total).toBe(100);
      expect(result.users.completedProfiles).toBe(80);
      expect(result.users.demographics).toEqual({
        male: 40,
        female: 30,
        nonbinary: 5,
        other: 3,
        unknown: 2,
      });

      expect(result.identities.total).toBe(200);
      expect(result.identities.averagePerUser).toBe(2);
      expect(result.identities.split).toEqual({
        instagram: 60,
        phone: 50,
        email: 40,
        linkedin: 20,
        twitter: 15,
        other: 15,
      });

      expect(result.devices.total).toBe(150);
      expect(result.devices.active).toBe(120);
      expect(result.devices.averagePerUser).toBe(1.5);
      expect(result.devices.platformSplit).toEqual({
        android: 90,
        ios: 60,
      });

      expect(result.likes.total).toBe(300);
      expect(result.likes.averagePerUser).toBe(3);
      expect(result.likes.targetIdentitySplit).toEqual({
        instagram: 100,
        phone: 80,
        email: 50,
        linkedin: 30,
        twitter: 20,
        other: 20,
      });
      expect(result.likes.intentSplit).toEqual({
        relationship: { count: 180, percentage: 60 },
        casual: { count: 90, percentage: 30 },
        open: { count: 30, percentage: 10 },
      });

      expect(result.matches.total).toBe(50);
      expect(result.matches.averagePerUser).toBe(0.5);
      expect(result.blocks.total).toBe(10);

      expect(result.credits.given.total).toBe(1000);
      expect(result.credits.given.splitBySource).toEqual({
        purchase: 500,
        bonus: 200,
        referral: 150,
        admin: 100,
        likeUsage: 50,
      });
      expect(result.credits.utilisedTotal).toBe(600);
    });

    it('should handle zero totals and empty groups gracefully without division by zero', async () => {
      // Arrange
      prisma.user.count.mockResolvedValue(0);
      prisma.userProfile.count.mockResolvedValue(0);
      (prisma.userProfile.groupBy as jest.Mock).mockResolvedValue([]);
      prisma.identity.count.mockResolvedValue(0);
      (prisma.identity.groupBy as jest.Mock).mockResolvedValue([]);
      prisma.device.count.mockResolvedValue(0);
      (prisma.device.groupBy as jest.Mock).mockResolvedValue([]);
      prisma.like.count.mockResolvedValue(0);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      (prisma.like.groupBy as jest.Mock).mockResolvedValue([]);
      prisma.match.count.mockResolvedValue(0);
      prisma.block.count.mockResolvedValue(0);
      (prisma.creditLedger.aggregate as jest.Mock)
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } });
      (prisma.creditLedger.groupBy as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.generateTotalReport();

      // Assert
      expect(result.users.total).toBe(0);
      expect(result.identities.averagePerUser).toBe(0);
      expect(result.devices.averagePerUser).toBe(0);
      expect(result.likes.averagePerUser).toBe(0);
      expect(result.likes.intentSplit.relationship.percentage).toBe(0);
      expect(result.matches.averagePerUser).toBe(0);
      expect(result.credits.given.total).toBe(0);
      expect(result.credits.utilisedTotal).toBe(0);
    });
  });

  describe('generateTimeframeReport', () => {
    it('should generate timeframe report when startDate, endDate and likes are present', async () => {
      // Arrange
      const startDate = new Date('2024-01-01T00:00:00.000Z');
      const endDate = new Date('2024-01-31T23:59:59.999Z');

      prisma.user.count.mockResolvedValue(25);
      (prisma.userProfile.groupBy as jest.Mock).mockResolvedValue([
        { gender: GenderType.MALE, _count: 10 },
        { gender: GenderType.FEMALE, _count: 10 },
        { gender: GenderType.NONBINARY, _count: 2 },
        { gender: GenderType.OTHER, _count: 2 },
        { gender: 'UNRECOGNIZED', _count: 1 },
      ]);

      prisma.identity.count.mockResolvedValue(30);
      (prisma.identity.groupBy as jest.Mock).mockResolvedValue([
        { type: IdentityType.INSTAGRAM, _count: 10 },
        { type: IdentityType.PHONE, _count: 8 },
        { type: IdentityType.EMAIL, _count: 6 },
        { type: IdentityType.LINKEDIN, _count: 2 },
        { type: IdentityType.TWITTER, _count: 2 },
        { type: IdentityType.OTHER, _count: 2 },
      ]);

      prisma.device.count.mockResolvedValue(20);
      (prisma.device.groupBy as jest.Mock).mockResolvedValue([
        { platform: DevicePlatform.ANDROID, _count: 12 },
        { platform: DevicePlatform.IOS, _count: 8 },
      ]);

      prisma.like.count.mockResolvedValue(40);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        { type: IdentityType.INSTAGRAM, count: BigInt(15) },
        { type: IdentityType.PHONE, count: BigInt(10) },
        { type: IdentityType.EMAIL, count: BigInt(5) },
        { type: IdentityType.LINKEDIN, count: BigInt(4) },
        { type: IdentityType.TWITTER, count: BigInt(3) },
        { type: IdentityType.OTHER, count: BigInt(3) },
      ]);
      (prisma.like.groupBy as jest.Mock).mockResolvedValue([
        { intent: IntentType.RELATIONSHIP, _count: 20 },
        { intent: IntentType.CASUAL, _count: 15 },
        { intent: IntentType.OPEN, _count: 5 },
      ]);

      prisma.match.count.mockResolvedValue(8);
      prisma.block.count.mockResolvedValue(1);

      (prisma.creditLedger.aggregate as jest.Mock)
        .mockResolvedValueOnce({ _sum: { amount: 300 } })
        .mockResolvedValueOnce({ _sum: { amount: 150 } });

      (prisma.creditLedger.groupBy as jest.Mock).mockResolvedValue([
        { source: CreditSource.PURCHASE, _sum: { amount: 150 } },
        { source: CreditSource.BONUS, _sum: { amount: 50 } },
        { source: CreditSource.REFERRAL, _sum: { amount: 40 } },
        { source: CreditSource.ADMIN, _sum: { amount: 30 } },
        { source: CreditSource.LIKE_USAGE, _sum: { amount: 30 } },
      ]);

      // Act
      const result = await service.generateTimeframeReport({
        startDate,
        endDate,
      });

      // Assert
      expect(result.timeframe.startDate).toEqual(startDate);
      expect(result.timeframe.endDate).toEqual(endDate);
      expect(result.users.acquired).toBe(25);
      expect(result.users.demographics).toEqual({
        male: 10,
        female: 10,
        nonbinary: 2,
        other: 2,
        unknown: 1,
      });
      expect(result.identities.created).toBe(30);
      expect(result.identities.split).toEqual({
        instagram: 10,
        phone: 8,
        email: 6,
        linkedin: 2,
        twitter: 2,
        other: 2,
      });
      expect(result.devices.registered).toBe(20);
      expect(result.devices.platformSplit).toEqual({
        android: 12,
        ios: 8,
      });
      expect(result.likes.made).toBe(40);
      expect(result.likes.targetIdentitySplit).toEqual({
        instagram: 15,
        phone: 10,
        email: 5,
        linkedin: 4,
        twitter: 3,
        other: 3,
      });
      expect(result.likes.intentSplit).toEqual({
        relationship: { count: 20, percentage: 50 },
        casual: { count: 15, percentage: 37.5 },
        open: { count: 5, percentage: 12.5 },
      });
      expect(result.matches.matched).toBe(8);
      expect(result.blocks.total).toBe(1);
      expect(result.credits.given.total).toBe(300);
      expect(result.credits.given.splitBySource).toEqual({
        purchase: 150,
        bonus: 50,
        referral: 40,
        admin: 30,
        likeUsage: 30,
      });
      expect(result.credits.utilisedTotal).toBe(150);
    });

    it('should generate timeframe report when no dates are provided and likes are zero', async () => {
      // Arrange
      prisma.user.count.mockResolvedValue(0);
      (prisma.userProfile.groupBy as jest.Mock).mockResolvedValue([]);
      prisma.identity.count.mockResolvedValue(0);
      (prisma.identity.groupBy as jest.Mock).mockResolvedValue([]);
      prisma.device.count.mockResolvedValue(0);
      (prisma.device.groupBy as jest.Mock).mockResolvedValue([]);
      prisma.like.count.mockResolvedValue(0);
      (prisma.like.groupBy as jest.Mock).mockResolvedValue([]);
      prisma.match.count.mockResolvedValue(0);
      prisma.block.count.mockResolvedValue(0);
      (prisma.creditLedger.aggregate as jest.Mock)
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } });
      (prisma.creditLedger.groupBy as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.generateTimeframeReport({});

      // Assert
      expect(result.timeframe.startDate).toBeNull();
      expect(result.timeframe.endDate).toBeInstanceOf(Date);
      expect(result.likes.made).toBe(0);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(result.likes.targetIdentitySplit).toEqual({
        instagram: 0,
        phone: 0,
        email: 0,
        linkedin: 0,
        twitter: 0,
        other: 0,
      });
    });

    it('should query raw likes when startDate is omitted but likesMade > 0', async () => {
      // Arrange
      prisma.user.count.mockResolvedValue(5);
      (prisma.userProfile.groupBy as jest.Mock).mockResolvedValue([]);
      prisma.identity.count.mockResolvedValue(5);
      (prisma.identity.groupBy as jest.Mock).mockResolvedValue([]);
      prisma.device.count.mockResolvedValue(5);
      (prisma.device.groupBy as jest.Mock).mockResolvedValue([]);
      prisma.like.count.mockResolvedValue(10);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        { type: IdentityType.PHONE, count: BigInt(10) },
      ]);
      (prisma.like.groupBy as jest.Mock).mockResolvedValue([
        { intent: IntentType.RELATIONSHIP, _count: 10 },
      ]);
      prisma.match.count.mockResolvedValue(0);
      prisma.block.count.mockResolvedValue(0);
      (prisma.creditLedger.aggregate as jest.Mock)
        .mockResolvedValueOnce({ _sum: { amount: 10 } })
        .mockResolvedValueOnce({ _sum: { amount: 5 } });
      (prisma.creditLedger.groupBy as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.generateTimeframeReport({
        endDate: new Date('2024-06-01T00:00:00.000Z'),
      });

      // Assert
      expect(result.likes.made).toBe(10);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(result.likes.targetIdentitySplit.phone).toBe(10);
    });
  });
});
