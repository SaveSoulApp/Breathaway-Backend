import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  HttpStatus,
} from '@nestjs/common';
import { LedgerEntryNotFoundException, InvalidCreditSourceException, InsufficientCreditsException } from '../application/exceptions';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CreditLedger,
  CreditSource,
  CreditTransactionType,
} from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';

import { CreditsService } from '../credits.service';
import {
  ConsumeCreditsRequestDto,
  CreditLedgerQueryRequestDto,
  GrantCreditsRequestDto,
} from '../dto';
import { CreditStatusFilter } from '../enums';
import { ClsService } from 'nestjs-cls';
import { NotificationsService } from '@modules/notifications/notifications.service';

describe('CreditsService', () => {
  let service: CreditsService;
  let prisma: MockPrismaService;

  const userId = 'user-id-123';
  const entryId = 'entry-id-123';

  const mockLedgerEntry: CreditLedger = {
    id: entryId,
    userId,
    transactionType: CreditTransactionType.CREDIT,
    amount: 10,
    source: CreditSource.PURCHASE,
    referenceId: 'ref-123',
    expiresAt: null,
    createdAt: DateUtil.now(),
  };

  beforeEach(async () => {
    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: NotificationsService, useValue: { dispatch: jest.fn() } },
        CreditsService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    service = module.get<CreditsService>(CreditsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getBalance', () => {
    it('should calculate balance correctly with credits and debits', async () => {
      // Arrange
      prisma.creditLedger.groupBy.mockResolvedValue([
        {
          transactionType: CreditTransactionType.CREDIT,
          _sum: { amount: 50 },
        },
        {
          transactionType: CreditTransactionType.DEBIT,
          _sum: { amount: 20 },
        },
      ] as unknown as Awaited<ReturnType<typeof prisma.creditLedger.groupBy>>);

      // Act
      const result = await service.getBalance(userId);

      // Assert
      expect(prisma.creditLedger.groupBy).toHaveBeenCalledWith({
        by: ['transactionType'],
        _sum: { amount: true },
        where: {
          userId,
        },
      });
      expect(result).toBe(30);
    });

    it('should return 0 if no ledgers exist', async () => {
      // Arrange
      prisma.creditLedger.groupBy.mockResolvedValue([]);

      // Act
      const result = await service.getBalance(userId);

      // Assert
      expect(result).toBe(0);
    });

    it('should handle undefined sum safely', async () => {
      // Arrange
      prisma.creditLedger.groupBy.mockResolvedValue([
        {
          transactionType: CreditTransactionType.CREDIT,
          _sum: { amount: null },
        },
      ] as unknown as Awaited<ReturnType<typeof prisma.creditLedger.groupBy>>);

      // Act
      const result = await service.getBalance(userId);

      // Assert
      expect(result).toBe(0);
    });
  });

  describe('getLedger', () => {
    it('should return paginated credit ledger with default query', async () => {
      // Arrange
      prisma.creditLedger.count.mockResolvedValue(1);
      prisma.creditLedger.findMany.mockResolvedValue([mockLedgerEntry]);

      // Act
      const result = await service.getLedger(userId, {});

      // Assert
      expect(prisma.creditLedger.count).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(prisma.creditLedger.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
        select: expect.any(Object),
      });
      expect(result).toEqual({
        data: [mockLedgerEntry],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
    });

    it('should apply filters correctly', async () => {
      // Arrange
      const query: CreditLedgerQueryRequestDto = {
        page: 2,
        limit: 10,
        transactionType: CreditTransactionType.CREDIT,
        source: [CreditSource.PURCHASE],
        createdFrom: '2023-01-01',
        createdTo: '2023-12-31',
        search: 'ref',
        creditStatus: CreditStatusFilter.ACTIVE,
        expiresWithinDays: 7,
      };
      prisma.creditLedger.count.mockResolvedValue(11);
      prisma.creditLedger.findMany.mockResolvedValue([mockLedgerEntry]);

      // Act
      await service.getLedger(userId, query);

      // Assert
      expect(prisma.creditLedger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          where: expect.objectContaining({
            userId,
            transactionType: CreditTransactionType.CREDIT,
            source: { in: [CreditSource.PURCHASE] },
            referenceId: { contains: 'ref', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should handle EXPIRED credit status filter', async () => {
      // Arrange
      const query: CreditLedgerQueryRequestDto = {
        creditStatus: CreditStatusFilter.EXPIRED,
      };
      prisma.creditLedger.count.mockResolvedValue(1);
      prisma.creditLedger.findMany.mockResolvedValue([mockLedgerEntry]);

      // Act
      await service.getLedger(userId, query);

      // Assert
      expect(prisma.creditLedger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            expiresAt: { lte: expect.any(Date) },
          }),
        }),
      );
    });

    it('should handle dates with T included', async () => {
      // Arrange
      const query: CreditLedgerQueryRequestDto = {
        createdTo: '2023-12-31T12:00:00Z',
      };
      prisma.creditLedger.count.mockResolvedValue(1);
      prisma.creditLedger.findMany.mockResolvedValue([mockLedgerEntry]);

      // Act
      await service.getLedger(userId, query);

      // Assert
      expect(prisma.creditLedger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              lte: DateUtil.parse('2023-12-31T12:00:00Z'),
            }),
          }),
        }),
      );
    });
  });

  describe('getLedgerEntry', () => {
    it('should return specific ledger entry', async () => {
      // Arrange
      prisma.creditLedger.findFirst.mockResolvedValue(mockLedgerEntry);

      // Act
      const result = await service.getLedgerEntry(userId, entryId);

      // Assert
      expect(prisma.creditLedger.findFirst).toHaveBeenCalledWith({
        where: { id: entryId, userId },
        select: expect.any(Object),
      });
      expect(result).toEqual(mockLedgerEntry);
    });

    it('should throw LedgerEntryNotFoundException if entry not found', async () => {
      // Arrange
      prisma.creditLedger.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getLedgerEntry(userId, entryId)).rejects.toThrow(
        new LedgerEntryNotFoundException(),
      );
    });
  });

  describe('grantCredits', () => {
    const dto: GrantCreditsRequestDto = {
      userId,
      amount: 10,
      source: CreditSource.PURCHASE,
      expiresAt: '2025-01-01',
    };

    it('should throw InvalidCreditSourceException if source is LIKE_USAGE', async () => {
      // Act & Assert
      await expect(
        service.grantCredits({ ...dto, source: CreditSource.LIKE_USAGE }),
      ).rejects.toThrow(
        new InvalidCreditSourceException(),
      );
    });

    it('should grant credits successfully', async () => {
      // Arrange
      prisma.creditLedger.create.mockResolvedValue(mockLedgerEntry);

      // Act
      const result = await service.grantCredits(dto);

      // Assert
      expect(prisma.creditLedger.create).toHaveBeenCalledWith({
        data: {
          userId,
          transactionType: CreditTransactionType.CREDIT,
          amount: 10,
          source: CreditSource.PURCHASE,
          referenceId: undefined,
          expiresAt: expect.any(Date),
        },
      });
      expect(result).toEqual(mockLedgerEntry);
    });
  });

  describe('consumeCredits', () => {
    const dto: ConsumeCreditsRequestDto = {
      userId,
      amount: 10,
      referenceId: 'like-ref-123',
    };

    it('should throw InsufficientCreditsException if insufficient credits', async () => {
      // Arrange
      jest.spyOn(service, 'getBalance').mockResolvedValue(5);

      // Act & Assert
      await expect(service.consumeCredits(dto)).rejects.toThrow(
        new InsufficientCreditsException(),
      );
    });

    it('should consume credits successfully', async () => {
      // Arrange
      jest.spyOn(service, 'getBalance').mockResolvedValue(15);
      prisma.creditLedger.create.mockResolvedValue(mockLedgerEntry);

      // Act
      const result = await service.consumeCredits(dto);

      // Assert
      expect(prisma.creditLedger.create).toHaveBeenCalledWith({
        data: {
          userId,
          transactionType: CreditTransactionType.DEBIT,
          amount: 10,
          source: CreditSource.LIKE_USAGE,
          referenceId: 'like-ref-123',
        },
      });
      expect(result).toEqual(mockLedgerEntry);
    });
  });

  describe('hasSufficientCredits', () => {
    it('should return true if balance is sufficient', async () => {
      // Arrange
      jest.spyOn(service, 'getBalance').mockResolvedValue(10);

      // Act
      const result = await service.hasSufficientCredits(userId, 5);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false if balance is insufficient', async () => {
      // Arrange
      jest.spyOn(service, 'getBalance').mockResolvedValue(5);

      // Act
      const result = await service.hasSufficientCredits(userId, 10);

      // Assert
      expect(result).toBe(false);
    });
  });
  describe('expireCreditsForUsers', () => {
    it('should consume closest-expiring credits first, saving them from expiration', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 100000);
      const soon = new Date(now.getTime() + 100000); // Expires in future
      const pastExpiry = new Date(now.getTime() - 1000); // Already expired

      prisma.creditLedger.findMany.mockResolvedValueOnce([
        {
          id: 'admin-credit',
          transactionType: CreditTransactionType.CREDIT,
          amount: 10,
          expiresAt: soon,
          createdAt: past,
        },
        {
          id: 'purchase-credit',
          transactionType: CreditTransactionType.CREDIT,
          amount: 10,
          expiresAt: pastExpiry,
          createdAt: now,
        },
        {
          id: 'usage-debit',
          transactionType: CreditTransactionType.DEBIT,
          amount: 5,
        },
      ] as any);

      await service.expireCreditsForUsers([userId], now);

      expect(prisma.creditLedger.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            referenceId: 'purchase-credit',
            amount: 5, // Only 5 expires — 5 was already consumed by the debit
          }),
        ]),
      });

      const call = (prisma.creditLedger.createMany as jest.Mock).mock
        .calls[0][0];
      const adminExp = call.data.find(
        (d: any) => d.referenceId === 'admin-credit',
      );
      expect(adminExp).toBeUndefined();
    });

    it('should consume credits with expiry before non-expiring credits', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 100000);
      const pastExpiry = new Date(now.getTime() - 1000); // Expired

      prisma.creditLedger.findMany.mockResolvedValueOnce([
        {
          id: 'referral-credit',
          transactionType: CreditTransactionType.CREDIT,
          amount: 10,
          expiresAt: null, // No expiry
          createdAt: past,
        },
        {
          id: 'purchase-credit',
          transactionType: CreditTransactionType.CREDIT,
          amount: 10,
          expiresAt: pastExpiry, // Expired
          createdAt: now,
        },
        {
          id: 'usage-debit',
          transactionType: CreditTransactionType.DEBIT,
          amount: 12,
        },
      ] as any);

      const result = await service.expireCreditsForUsers([userId], now);

      expect(prisma.creditLedger.createMany).not.toHaveBeenCalled();
      expect(result.expiredDebitsInserted).toBe(0);
    });
  });

  describe('handleExpiryBatch', () => {
    it('should delegate to expireCreditsForUsers with the parsed asOf date', async () => {
      const asOf = new Date();
      const payload = { userIds: [userId], asOf: asOf.toISOString() };

      prisma.creditLedger.findMany.mockResolvedValueOnce([]);

      await service.handleExpiryBatch(payload);

      // findMany was called once for the user's ledger — confirms delegation occurred
      expect(prisma.creditLedger.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.creditLedger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId } }),
      );
    });
  });
});
