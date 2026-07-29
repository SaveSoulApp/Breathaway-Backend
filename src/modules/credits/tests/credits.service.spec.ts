import { EventEmitter2 } from '@nestjs/event-emitter';
import { HttpStatus } from '@nestjs/common';
import {
  LedgerEntryNotFoundException,
  InvalidCreditSourceException,
  InsufficientCreditsException,
} from '../application/exceptions';
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
    const mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue(mockLogger),
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
    it('should calculate balance correctly with active credits and non-expired debits', async () => {
      // Arrange — 50 credits active, 20 spent via LIKE_USAGE
      prisma.creditLedger.findMany.mockResolvedValueOnce([
        {
          transactionType: CreditTransactionType.CREDIT,
          amount: 50,
          source: CreditSource.PURCHASE,
          expiresAt: null,
          createdAt: DateUtil.now(),
        },
        {
          transactionType: CreditTransactionType.DEBIT,
          amount: 20,
          source: CreditSource.LIKE_USAGE,
          expiresAt: null,
          createdAt: DateUtil.now(),
        },
      ] as any);

      // Act
      const result = await service.getBalance(userId);

      // Assert
      expect(prisma.creditLedger.findMany).toHaveBeenCalledWith({
        where: { userId },
        select: {
          transactionType: true,
          amount: true,
          source: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toBe(30);
    });

    it('should return 0 when no ledger entries exist', async () => {
      // Arrange
      prisma.creditLedger.findMany.mockResolvedValueOnce([]);

      // Act
      const result = await service.getBalance(userId);

      // Assert
      expect(result).toBe(0);
    });

    it('should charge the spend against the earliest-expiring bundle (FIFO), leaving later bundle untouched', async () => {
      // Arrange — reproduces the exact user scenario:
      //   Jul 20: +5 credits, expires Jul 29
      //   Jul 22: +5 credits, expires Jul 31
      //   Jul 23: -1 LIKE_USAGE
      //   Querying on Jul 30 — Jul 29 bundle has expired.
      //
      // Expected: balance = 5, NOT 4.
      // The 1 debit is allocated against the Jul 29 bundle (FIFO), which is
      // now expired and excluded. The Jul 31 bundle is entirely untouched.
      const jul29Expiry = new Date('2026-07-29T18:29:59.999Z'); // 23:59:59 IST
      const jul31Expiry = new Date('2026-07-31T18:29:59.999Z');

      // Simulate querying on Jul 30 IST — Jul 29 bundle is past its expiry
      jest.useFakeTimers().setSystemTime(new Date('2026-07-30T00:30:00+05:30'));

      prisma.creditLedger.findMany.mockResolvedValueOnce([
        {
          transactionType: CreditTransactionType.CREDIT,
          amount: 5,
          source: CreditSource.PURCHASE,
          expiresAt: jul29Expiry,
          createdAt: new Date('2026-07-20T00:00:00Z'),
        },
        {
          transactionType: CreditTransactionType.CREDIT,
          amount: 5,
          source: CreditSource.PURCHASE,
          expiresAt: jul31Expiry,
          createdAt: new Date('2026-07-22T00:00:00Z'),
        },
        {
          transactionType: CreditTransactionType.DEBIT,
          amount: 1,
          source: CreditSource.LIKE_USAGE,
          expiresAt: null,
          createdAt: new Date('2026-07-23T00:00:00Z'),
        },
      ] as any);

      // Act
      const result = await service.getBalance(userId);

      // Assert — Jul 31 bundle (5) is fully intact; the 1 debit was absorbed
      // by the expired Jul 29 bundle via FIFO allocation.
      expect(result).toBe(5);

      jest.useRealTimers();
    });

    it('should charge the spend against the earliest-expiring bundle (FIFO), pre-cron (no EXPIRED rows yet)', async () => {
      // Arrange — same scenario as above but the cron has NOT yet run, so no
      // EXPIRED DEBIT row exists for the Jul 29 bundle. The balance must still
      // be 5, proving the result is cron-independent.
      const jul29Expiry = new Date('2026-07-29T18:29:59.999Z');
      const jul31Expiry = new Date('2026-07-31T18:29:59.999Z');

      jest.useFakeTimers().setSystemTime(new Date('2026-07-30T00:30:00+05:30'));

      prisma.creditLedger.findMany.mockResolvedValueOnce([
        {
          transactionType: CreditTransactionType.CREDIT,
          amount: 5,
          source: CreditSource.PURCHASE,
          expiresAt: jul29Expiry,
          createdAt: new Date('2026-07-20T00:00:00Z'),
        },
        {
          transactionType: CreditTransactionType.CREDIT,
          amount: 5,
          source: CreditSource.PURCHASE,
          expiresAt: jul31Expiry,
          createdAt: new Date('2026-07-22T00:00:00Z'),
        },
        {
          transactionType: CreditTransactionType.DEBIT,
          amount: 1,
          source: CreditSource.LIKE_USAGE,
          expiresAt: null,
          createdAt: new Date('2026-07-23T00:00:00Z'),
        },
        // No EXPIRED row — cron has not run yet
      ] as any);

      // Act
      const result = await service.getBalance(userId);

      // Assert — must be 5 even without the cron's compensating DEBIT row
      expect(result).toBe(5);

      jest.useRealTimers();
    });

    it('should exclude expired CREDIT bundles that were fully unused (no debits)', async () => {
      // Arrange — 10 credits expired, no usage. Cron has not run.
      const pastExpiry = new Date(Date.now() - 1000);
      prisma.creditLedger.findMany.mockResolvedValueOnce([
        {
          transactionType: CreditTransactionType.CREDIT,
          amount: 10,
          source: CreditSource.PURCHASE,
          expiresAt: pastExpiry,
          createdAt: DateUtil.now(),
        },
      ] as any);

      // Act
      const result = await service.getBalance(userId);

      // Assert — expired, untouched bundle contributes 0
      expect(result).toBe(0);
    });

    it('should not double-deduct when EXPIRED cron rows are present in the ledger', async () => {
      // Arrange — cron has run and inserted an EXPIRED DEBIT for the lapsed bundle.
      // EXPIRED rows must be excluded from the debit sum (they close the books on
      // an already-excluded CREDIT; counting them would produce a negative balance).
      const pastExpiry = new Date(Date.now() - 1000);
      const future = new Date(Date.now() + 86_400_000);
      prisma.creditLedger.findMany.mockResolvedValueOnce([
        {
          transactionType: CreditTransactionType.CREDIT,
          amount: 5,
          source: CreditSource.PURCHASE,
          expiresAt: pastExpiry,
          createdAt: new Date('2026-07-20T00:00:00Z'),
        },
        {
          transactionType: CreditTransactionType.CREDIT,
          amount: 5,
          source: CreditSource.PURCHASE,
          expiresAt: future,
          createdAt: new Date('2026-07-22T00:00:00Z'),
        },
        {
          transactionType: CreditTransactionType.DEBIT,
          amount: 1,
          source: CreditSource.LIKE_USAGE,
          expiresAt: null,
          createdAt: new Date('2026-07-23T00:00:00Z'),
        },
        {
          // EXPIRED DEBIT inserted by cron for the lapsed bundle
          transactionType: CreditTransactionType.DEBIT,
          amount: 4,
          source: CreditSource.EXPIRED,
          expiresAt: null,
          createdAt: new Date('2026-07-29T18:30:00Z'),
        },
      ] as any);

      // Act
      const result = await service.getBalance(userId);

      // Assert — same result as pre-cron: EXPIRED DEBIT is excluded correctly
      expect(result).toBe(5);
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
      ).rejects.toThrow(new InvalidCreditSourceException());
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
