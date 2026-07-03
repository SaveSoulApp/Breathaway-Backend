import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { CreditSource, CreditTransactionType } from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';

import { CreditsController } from '../credits.controller';
import { CreditsService } from '../credits.service';
import { ConsumeCreditsRequestDto, CreditLedgerQueryRequestDto } from '../dto';
import { ClsService } from 'nestjs-cls';

describe('CreditsController', () => {
  let controller: CreditsController;
  let service: jest.Mocked<CreditsService>;

  const userId = 'user-id-123';
  const entryId = 'entry-id-123';

  const mockLedgerEntry = {
    id: entryId,
    transactionType: CreditTransactionType.CREDIT,
    amount: 10,
    source: CreditSource.PURCHASE,
    referenceId: 'ref-123',
    expiresAt: null,
    createdAt: DateUtil.now(),
  };

  const mockPaginatedLedger = {
    data: [mockLedgerEntry],
    meta: {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  };

  beforeEach(async () => {
    const mockService = {
      getBalance: jest.fn(),
      getLedger: jest.fn(),
      getLedgerEntry: jest.fn(),
      consumeCredits: jest.fn(),
    };

    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({ log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreditsController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: CreditsService, useValue: mockService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    controller = module.get<CreditsController>(CreditsController);
    service = module.get(CreditsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getBalance', () => {
    it('should return credit balance', async () => {
      // Arrange
      service.getBalance.mockResolvedValue(100);

      // Act
      const result = await controller.getBalance(userId);

      // Assert
      expect(service.getBalance).toHaveBeenCalledWith(userId);
      expect(result).toEqual({ balance: 100 });
    });
  });

  describe('getLedger', () => {
    it('should return paginated credit ledger', async () => {
      // Arrange
      const query: CreditLedgerQueryRequestDto = { page: 1, limit: 20 };
      service.getLedger.mockResolvedValue(mockPaginatedLedger);

      // Act
      const result = await controller.getLedger(userId, query);

      // Assert
      expect(service.getLedger).toHaveBeenCalledWith(userId, query);
      expect(result).toEqual(mockPaginatedLedger);
    });
  });

  describe('getLedgerEntry', () => {
    it('should return specific ledger entry', async () => {
      // Arrange
      service.getLedgerEntry.mockResolvedValue(mockLedgerEntry);

      // Act
      const result = await controller.getLedgerEntry(userId, entryId);

      // Assert
      expect(service.getLedgerEntry).toHaveBeenCalledWith(userId, entryId);
      expect(result).toEqual(mockLedgerEntry);
    });
  });

  describe('consumeCredits', () => {
    it('should consume credits and return ledger entry', async () => {
      // Arrange
      const dto: ConsumeCreditsRequestDto = {
        userId,
        amount: 10,
        referenceId: 'like-ref-123',
      };
      service.consumeCredits.mockResolvedValue(
        mockLedgerEntry as unknown as Awaited<
          ReturnType<typeof service.consumeCredits>
        >,
      );

      // Act
      const result = await controller.consumeCredits(dto);

      // Assert
      expect(service.consumeCredits).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockLedgerEntry);
    });
  });
});
