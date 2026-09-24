import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentGateway,
  TransactionChannel,
  TransactionEnvironment,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { AdminBasicAuthGuard } from '@modules/admin/guards/admin-basic-auth.guard';

import {
  PaginatedTransactionResponseDto,
  TransactionQueryRequestDto,
  TransactionResponseDto,
} from '../dto';
import { TransactionsController } from '../transactions.controller';
import { TransactionsService } from '../transactions.service';

describe('TransactionsController', () => {
  let controller: TransactionsController;
  let service: jest.Mocked<TransactionsService>;

  const mockTxResponse: TransactionResponseDto = {
    id: 'txn-1',
    userId: 'user-1',
    gateway: PaymentGateway.REVENUECAT,
    gatewayTransactionId: 'gw-txn-1',
    gatewayEventId: 'gw-evt-1',
    gatewayUserId: 'gw-user-1',
    type: TransactionType.PURCHASE,
    status: TransactionStatus.COMPLETED,
    environment: TransactionEnvironment.SANDBOX,
    channel: TransactionChannel.IOS,
    productId: 'likes_10',
    creditsGranted: 10,
    amount: 9.99,
    currency: 'USD',
    countryCode: 'US',
    occurredAt: new Date('2024-01-01T00:00:00.000Z'),
    createdAt: new Date('2024-01-01T00:00:01.000Z'),
  };

  const mockPaginatedResponse: PaginatedTransactionResponseDto = {
    data: [mockTxResponse],
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
      findAll: jest.fn(),
      findOne: jest.fn(),
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
      controllers: [TransactionsController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: TransactionsService, useValue: mockService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    })
      .overrideGuard(AdminBasicAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<TransactionsController>(TransactionsController);
    service = module.get(TransactionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should delegate to service.findAll and return paginated transactions', async () => {
      // Arrange
      const query: TransactionQueryRequestDto = { page: 1, limit: 20 };
      service.findAll.mockResolvedValue(mockPaginatedResponse);

      // Act
      const result = await controller.findAll(query);

      // Assert
      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockPaginatedResponse);
    });
  });

  describe('findOne', () => {
    it('should delegate to service.findOne and return a single transaction', async () => {
      // Arrange
      service.findOne.mockResolvedValue(mockTxResponse);

      // Act
      const result = await controller.findOne('txn-1');

      // Assert
      expect(service.findOne).toHaveBeenCalledWith('txn-1');
      expect(result).toEqual(mockTxResponse);
    });
  });
});
