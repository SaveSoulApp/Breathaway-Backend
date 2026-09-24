import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentGateway,
  Prisma,
  Transaction,
  TransactionChannel,
  TransactionEnvironment,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { TransactionNotFoundException } from '../application/exceptions';
import { RecordTransactionRequestDto } from '../dto';
import { TransactionsService } from '../transactions.service';

const USER_ID = '01JQ8ZC5X9T7VBN3KDME4RGWFA';

const mockTransaction: Transaction = {
  id: 'txn-id-123',
  userId: USER_ID,
  gateway: PaymentGateway.REVENUECAT,
  gatewayTransactionId: 'test_1788885960147_51a83d84',
  gatewayEventId: 'A18A73FC-D21F-453B-9869-DBA6CA8A6E9C',
  gatewayUserId: USER_ID,
  type: TransactionType.PURCHASE,
  status: TransactionStatus.COMPLETED,
  environment: TransactionEnvironment.SANDBOX,
  channel: TransactionChannel.IOS,
  productId: 'likes_10',
  creditsGranted: 10,
  amount: new Prisma.Decimal(40.5),
  currency: 'USD',
  countryCode: 'IN',
  occurredAt: new Date('2026-09-08T16:46:00.828Z'),
  rawPayload: null,
  createdAt: new Date('2026-09-08T16:46:01.000Z'),
  updatedAt: new Date('2026-09-08T16:46:01.000Z'),
};

const buildDto = (
  overrides: Partial<RecordTransactionRequestDto> = {},
): RecordTransactionRequestDto => ({
  userId: USER_ID,
  gateway: PaymentGateway.REVENUECAT,
  gatewayTransactionId: 'test_1788885960147_51a83d84',
  gatewayEventId: 'A18A73FC-D21F-453B-9869-DBA6CA8A6E9C',
  gatewayUserId: USER_ID,
  environment: TransactionEnvironment.SANDBOX,
  channel: TransactionChannel.IOS,
  productId: 'likes_10',
  creditsGranted: 10,
  amount: 40.5,
  currency: 'USD',
  countryCode: 'IN',
  occurredAt: '2026-09-08T16:46:00.828Z',
  ...overrides,
});

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: MockPrismaService;
  let emitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    emitter = { emit: jest.fn() };

    const mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      event: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: LoggerService,
          useValue: { forContext: jest.fn().mockReturnValue(mockLogger) },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: emitter },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(TransactionsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('record', () => {
    it('persists the transaction and returns it', async () => {
      prisma.transaction.create.mockResolvedValue(mockTransaction as never);

      const result = await service.record(buildDto());

      expect(result).toEqual(mockTransaction);
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          gateway: PaymentGateway.REVENUECAT,
          gatewayTransactionId: 'test_1788885960147_51a83d84',
          productId: 'likes_10',
          creditsGranted: 10,
        }),
      });
    });

    it('strips contact details out of the stored payload', async () => {
      // RevenueCat echoes the buyer's email, phone and display name back under
      // subscriber_attributes; persisting them verbatim would put plaintext PII
      // in a table that is otherwise free of it.
      prisma.transaction.create.mockResolvedValue(mockTransaction as never);

      await service.record(
        buildDto({
          rawPayload: {
            event: {
              product_id: 'likes_10',
              subscriber_attributes: {
                $email: { value: 'buyer@example.com' },
                $phoneNumber: { value: '+19795551234' },
              },
              nested: { email: 'other@example.com', keep: 'this' },
            },
          },
        }),
      );

      const created = prisma.transaction.create.mock.calls[0][0] as {
        data: { rawPayload: Record<string, unknown> };
      };
      const serialized = JSON.stringify(created.data.rawPayload);

      expect(serialized).not.toContain('buyer@example.com');
      expect(serialized).not.toContain('+19795551234');
      expect(serialized).not.toContain('other@example.com');
      expect(serialized).toContain('likes_10');
      expect(serialized).toContain('this');
    });

    it('writes a JSON null when no payload is supplied', async () => {
      prisma.transaction.create.mockResolvedValue(mockTransaction as never);

      await service.record(buildDto());

      const created = prisma.transaction.create.mock.calls[0][0] as {
        data: { rawPayload: unknown };
      };
      expect(created.data.rawPayload).toBe(Prisma.DbNull);
    });

    it('emits a purchase audit event for an attributed transaction', async () => {
      prisma.transaction.create.mockResolvedValue(mockTransaction as never);

      await service.record(buildDto());

      expect(emitter.emit).toHaveBeenCalled();
    });

    it('emits no audit event when the transaction has no owner', async () => {
      // The audit payload requires an actor, and an unresolved purchase has none.
      prisma.transaction.create.mockResolvedValue({
        ...mockTransaction,
        userId: null,
      } as never);

      await service.record(buildDto({ userId: undefined }));

      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('rethrows a duplicate so the caller can treat it as a redelivery', async () => {
      const duplicate = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '7.8.0' },
      );
      prisma.transaction.create.mockRejectedValue(duplicate);

      await expect(service.record(buildDto())).rejects.toBe(duplicate);
    });

    it('logs an error and rethrows if a database error occurs that is not P2002', async () => {
      const dbError = new Error('Database connection failed');
      prisma.transaction.create.mockRejectedValue(dbError);

      await expect(service.record(buildDto())).rejects.toThrow(dbError);
    });

    it('recursively sanitizes arrays inside rawPayload', async () => {
      prisma.transaction.create.mockResolvedValue(mockTransaction as never);

      await service.record(
        buildDto({
          rawPayload: {
            items: [
              {
                $email: { value: 'arraybuyer@example.com' },
                item_name: 'pack_1',
              },
            ],
          },
        }),
      );

      const created = prisma.transaction.create.mock.calls[0][0] as unknown as {
        data: { rawPayload: { items: Array<Record<string, unknown>> } };
      };
      const serialized = JSON.stringify(created.data.rawPayload);

      expect(serialized).not.toContain('arraybuyer@example.com');
      expect(serialized).toContain('pack_1');
    });

    it('uses the supplied transaction client when one is given', async () => {
      const tx = {
        transaction: { create: jest.fn().mockResolvedValue(mockTransaction) },
      };

      await service.record(buildDto(), tx as never);

      expect(tx.transaction.create).toHaveBeenCalled();
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
  });

  describe('findByGatewayTransaction', () => {
    it('looks the transaction up on the composite unique key', async () => {
      prisma.transaction.findUnique.mockResolvedValue(mockTransaction as never);

      const result = await service.findByGatewayTransaction(
        PaymentGateway.REVENUECAT,
        'test_1788885960147_51a83d84',
      );

      expect(result).toEqual(mockTransaction);
      expect(prisma.transaction.findUnique).toHaveBeenCalledWith({
        where: {
          gateway_gatewayTransactionId: {
            gateway: PaymentGateway.REVENUECAT,
            gatewayTransactionId: 'test_1788885960147_51a83d84',
          },
        },
      });
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.transaction.count.mockResolvedValue(1 as never);
      prisma.transaction.findMany.mockResolvedValue([mockTransaction] as never);
    });

    it('unwraps the Decimal amount into a plain number', async () => {
      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data[0].amount).toBe(40.5);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('never returns the stored payload', async () => {
      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data[0]).not.toHaveProperty('rawPayload');
    });

    it('filters by gateway and environment', async () => {
      await service.findAll({
        page: 1,
        limit: 20,
        gateway: PaymentGateway.REVENUECAT,
        environment: TransactionEnvironment.SANDBOX,
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            gateway: PaymentGateway.REVENUECAT,
            environment: TransactionEnvironment.SANDBOX,
          }),
        }),
      );
    });

    it('filters by channel', async () => {
      await service.findAll({
        page: 1,
        limit: 20,
        channel: TransactionChannel.IOS,
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            channel: TransactionChannel.IOS,
          }),
        }),
      );
    });

    it('expands a date-only upper bound to end of day', async () => {
      await service.findAll({
        page: 1,
        limit: 20,
        occurredTo: '2026-09-08',
      });

      const call = prisma.transaction.findMany.mock.calls[0][0] as {
        where: { occurredAt: { lte: Date } };
      };
      expect(call.where.occurredAt.lte.toISOString()).toBe(
        '2026-09-08T23:59:59.999Z',
      );
    });

    it('filters by occurredFrom and occurredTo with ISO strings', async () => {
      await service.findAll({
        page: 1,
        limit: 20,
        occurredFrom: '2026-09-01T00:00:00.000Z',
        occurredTo: '2026-09-08T12:00:00.000Z',
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            occurredAt: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        }),
      );
    });

    it('filters by search term on gatewayTransactionId and remaining filters', async () => {
      await service.findAll({
        page: 1,
        limit: 20,
        userId: USER_ID,
        type: TransactionType.PURCHASE,
        status: TransactionStatus.COMPLETED,
        productId: 'likes_10',
        search: '51a83d84',
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: USER_ID,
            type: TransactionType.PURCHASE,
            status: TransactionStatus.COMPLETED,
            productId: 'likes_10',
            gatewayTransactionId: {
              contains: '51a83d84',
              mode: 'insensitive',
            },
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns the mapped transaction', async () => {
      prisma.transaction.findUnique.mockResolvedValue(mockTransaction as never);

      const result = await service.findOne('txn-id-123');

      expect(result.id).toBe('txn-id-123');
      expect(result.amount).toBe(40.5);
    });

    it('throws when the transaction does not exist', async () => {
      prisma.transaction.findUnique.mockResolvedValue(null as never);

      await expect(service.findOne('missing')).rejects.toThrow(
        TransactionNotFoundException,
      );
    });
  });
});
