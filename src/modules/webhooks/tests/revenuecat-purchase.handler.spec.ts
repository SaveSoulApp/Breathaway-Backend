import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { CreditsService } from '@modules/credits/credits.service';
import { SubscriptionPlansService } from '@modules/subscriptions/services/subscription-plans.service';
import { TransactionsService } from '@modules/transactions/transactions.service';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CreditSource,
  PaymentGateway,
  Prisma,
  TransactionEnvironment,
  TransactionStatus,
} from '@prisma/client';

import { PurchaseEventType } from '../enums/purchase-event-type.enum';
import { RevenueCatEventType } from '../enums/revenuecat-event-type.enum';
import { RevenueCatPurchaseHandler } from '../handlers/revenuecat-purchase.handler';
import { ParsedPurchaseEvent } from '../interfaces/purchase-event.interface';

const USER_ID = '01JQ8ZC5X9T7VBN3KDME4RGWFA';
const ANON_ID = '$RCAnonymousID:856f59bbe65349a0a9448a4800ccb5ef';
const FIREBASE_UID = 'w70oK2RLTWd8n4appagMhNgolyR2';

const buildEvent = (
  overrides: Partial<ParsedPurchaseEvent> = {},
): ParsedPurchaseEvent => ({
  gateway: PaymentGateway.REVENUECAT,
  type: PurchaseEventType.PURCHASE,
  providerEventType: RevenueCatEventType.NON_RENEWING_PURCHASE,
  gatewayTransactionId: 'test_1788885960147_51a83d84',
  gatewayEventId: 'A18A73FC-D21F-453B-9869-DBA6CA8A6E9C',
  gatewayUserId: USER_ID,
  candidateUserIds: [USER_ID, ANON_ID],
  productId: 'likes_10',
  environment: TransactionEnvironment.SANDBOX,
  amount: 40.5,
  currency: 'USD',
  countryCode: 'IN',
  occurredAt: new Date(1788885960828),
  raw: { event: { product_id: 'likes_10' } },
  ...overrides,
});

const buildPlan = (overrides: Record<string, unknown> = {}) => ({
  id: 'plan-id-123',
  name: '10 Likes',
  slug: 'likes-10',
  appleProductId: 'likes_10',
  googleProductId: 'likes_10',
  creditsGranted: 10,
  validityDays: 30,
  status: 'ACTIVE',
  ...overrides,
});

describe('RevenueCatPurchaseHandler', () => {
  let handler: RevenueCatPurchaseHandler;
  let prisma: MockPrismaService;
  let transactionsService: jest.Mocked<
    Pick<TransactionsService, 'record' | 'findByGatewayTransaction'>
  >;
  let creditsService: jest.Mocked<Pick<CreditsService, 'grantCredits'>>;
  let plansService: jest.Mocked<
    Pick<SubscriptionPlansService, 'getPlanByProductId'>
  >;

  const duplicateError = new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed',
    { code: 'P2002', clientVersion: '7.8.0' },
  );

  beforeEach(async () => {
    prisma = createPrismaMock();
    // Run the callback against the same mock so assertions can inspect both writes.
    (prisma.$transaction as unknown as jest.Mock).mockImplementation(
      (cb: (tx: unknown) => unknown) => cb(prisma),
    );

    transactionsService = {
      record: jest.fn().mockResolvedValue({ id: 'txn-id-123' }),
      findByGatewayTransaction: jest.fn().mockResolvedValue(null),
    };
    creditsService = { grantCredits: jest.fn().mockResolvedValue({}) };
    plansService = {
      getPlanByProductId: jest.fn().mockResolvedValue(buildPlan()),
    };

    const mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevenueCatPurchaseHandler,
        {
          provide: LoggerService,
          useValue: { forContext: jest.fn().mockReturnValue(mockLogger) },
        },
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(90) },
        },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: CreditsService, useValue: creditsService },
        { provide: SubscriptionPlansService, useValue: plansService },
      ],
    }).compile();

    handler = module.get(RevenueCatPurchaseHandler);
    prisma.user.findFirst.mockResolvedValue({ id: USER_ID } as never);
  });

  afterEach(() => jest.clearAllMocks());

  describe('canHandle', () => {
    it('claims purchases', () => {
      expect(handler.canHandle(buildEvent())).toBe(true);
    });

    it.each([PurchaseEventType.REFUND, PurchaseEventType.UNKNOWN])(
      'does not claim %s events',
      (type) => {
        expect(handler.canHandle(buildEvent({ type }))).toBe(false);
      },
    );
  });

  describe('handle', () => {
    it('records the transaction and grants the plan credits', async () => {
      await handler.handle(buildEvent());

      expect(transactionsService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          gateway: PaymentGateway.REVENUECAT,
          gatewayTransactionId: 'test_1788885960147_51a83d84',
          productId: 'likes_10',
          creditsGranted: 10,
          status: TransactionStatus.COMPLETED,
          environment: TransactionEnvironment.SANDBOX,
        }),
        prisma,
      );

      expect(creditsService.grantCredits).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          amount: 10,
          source: CreditSource.PURCHASE,
          // The ledger references our own transaction, not the gateway's ID.
          referenceId: 'txn-id-123',
        }),
        prisma,
      );
    });

    it('expires the granted bundle after the plan validity window', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      await handler.handle(buildEvent());

      const [grant] = creditsService.grantCredits.mock.calls[0];
      expect(grant.expiresAt).toBe('2026-01-31T00:00:00.000Z');

      jest.useRealTimers();
    });

    it('falls back to CREDIT_EXPIRY_DAYS when the plan sets no validity', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      plansService.getPlanByProductId.mockResolvedValue(
        buildPlan({ validityDays: 0 }) as never,
      );

      await handler.handle(buildEvent());

      const [grant] = creditsService.grantCredits.mock.calls[0];
      expect(grant.expiresAt).toBe('2026-04-01T00:00:00.000Z');

      jest.useRealTimers();
    });

    it('skips a redelivered event without granting again', async () => {
      transactionsService.findByGatewayTransaction.mockResolvedValue({
        id: 'txn-id-123',
      } as never);

      await handler.handle(buildEvent());

      expect(transactionsService.record).not.toHaveBeenCalled();
      expect(creditsService.grantCredits).not.toHaveBeenCalled();
    });

    it('swallows the unique-constraint violation from a concurrent redelivery', async () => {
      transactionsService.record.mockRejectedValue(duplicateError);

      await expect(handler.handle(buildEvent())).resolves.toBeUndefined();
      expect(creditsService.grantCredits).not.toHaveBeenCalled();
    });

    it('propagates genuine failures so the gateway retries', async () => {
      transactionsService.record.mockRejectedValue(new Error('database down'));

      await expect(handler.handle(buildEvent())).rejects.toThrow(
        'database down',
      );
    });

    it('resolves the user from an alias when app_user_id is not a local ID', async () => {
      prisma.user.findFirst.mockImplementation((args: never) => {
        const where = (args as { where: { id: string } }).where;
        return Promise.resolve(
          where.id === USER_ID ? { id: USER_ID } : null,
        ) as never;
      });

      await handler.handle(
        buildEvent({
          gatewayUserId: FIREBASE_UID,
          candidateUserIds: [FIREBASE_UID, ANON_ID, USER_ID],
        }),
      );

      expect(creditsService.grantCredits).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID }),
        prisma,
      );
    });

    it('never queries the database for non-ULID candidates', async () => {
      await handler.handle(
        buildEvent({ candidateUserIds: [FIREBASE_UID, ANON_ID] }),
      );

      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('records an unattributed transaction when no candidate resolves', async () => {
      prisma.user.findFirst.mockResolvedValue(null as never);

      await handler.handle(buildEvent());

      expect(transactionsService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: undefined,
          creditsGranted: undefined,
        }),
        prisma,
      );
      expect(creditsService.grantCredits).not.toHaveBeenCalled();
    });

    it('records without granting when the product maps to no plan', async () => {
      plansService.getPlanByProductId.mockRejectedValue(new Error('not found'));

      await handler.handle(buildEvent());

      expect(transactionsService.record).toHaveBeenCalledWith(
        expect.objectContaining({ status: TransactionStatus.PENDING }),
      );
      expect(creditsService.grantCredits).not.toHaveBeenCalled();
    });

    it('skips an event carrying no transaction ID', async () => {
      await handler.handle(buildEvent({ gatewayTransactionId: null }));

      expect(
        transactionsService.findByGatewayTransaction,
      ).not.toHaveBeenCalled();
      expect(transactionsService.record).not.toHaveBeenCalled();
    });

    it('skips an event carrying no product ID', async () => {
      await handler.handle(buildEvent({ productId: null }));

      expect(transactionsService.record).not.toHaveBeenCalled();
    });
  });
});
