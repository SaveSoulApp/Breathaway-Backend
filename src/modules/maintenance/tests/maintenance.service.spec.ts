import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { CreditTransactionType, LikeStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { CreditsService } from '@modules/credits/credits.service';
import { PubSubEvent } from '@modules/pubsub/enums/pubsub-events.enum';
import { PubSubTopic } from '@modules/pubsub/enums/pubsub-topics.enum';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { SubscriptionsService } from '@modules/subscriptions/services/subscriptions.service';

import { LIKES_EXPIRED_EVENT } from '../events';
import { MaintenanceService } from '../maintenance.service';

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let prisma: MockPrismaService;
  let eventEmitterMock: { emit: jest.Mock };
  let pubSubPublisherMock: { publish: jest.Mock };
  let subscriptionsServiceMock: { expireSubscriptions: jest.Mock };

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    event: jest.fn(),
  };

  const loggerServiceMock = {
    forContext: jest.fn().mockReturnValue(mockLogger),
  };

  beforeEach(async () => {
    eventEmitterMock = { emit: jest.fn() };
    pubSubPublisherMock = { publish: jest.fn() };
    subscriptionsServiceMock = { expireSubscriptions: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: eventEmitterMock },
        { provide: PrismaService, useValue: createPrismaMock() },
        {
          provide: CreditsService,
          useValue: { expireCreditsForUsers: jest.fn() },
        },
        {
          provide: SubscriptionsService,
          useValue: subscriptionsServiceMock,
        },
        { provide: PubSubPublisherService, useValue: pubSubPublisherMock },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(100) },
        },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    service = module.get<MaintenanceService>(MaintenanceService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('voidPendingLikes', () => {
    it('should void likes older than 90 days and emit LIKES_EXPIRED event', async () => {
      // Arrange
      (prisma.like.groupBy as jest.Mock).mockResolvedValueOnce([
        {
          senderUserId: 'user-1',
          _count: { id: 3 },
        },
      ]);
      (prisma.like.updateMany as jest.Mock).mockResolvedValueOnce({ count: 3 });

      // Act
      const result = await service.voidPendingLikes();

      // Assert
      expect(result).toEqual({ voidedCount: 3 });
      expect(prisma.like.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: LikeStatus.PENDING,
          }),
          data: { status: LikeStatus.VOIDED },
        }),
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        LIKES_EXPIRED_EVENT,
        expect.objectContaining({
          userId: 'user-1',
          count: 3,
        }),
      );
    });

    it('should handle zero expiring likes gracefully', async () => {
      // Arrange
      (prisma.like.groupBy as jest.Mock).mockResolvedValueOnce([]);
      (prisma.like.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

      // Act
      const result = await service.voidPendingLikes();

      // Assert
      expect(result).toEqual({ voidedCount: 0 });
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });

    it('should log and rethrow an error if voiding fails', async () => {
      // Arrange
      const dbError = new Error('Database connection failed');
      (prisma.like.groupBy as jest.Mock).mockRejectedValueOnce(dbError);

      // Act & Assert
      await expect(service.voidPendingLikes()).rejects.toThrow(dbError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to void pending likes',
        expect.objectContaining({
          step: 'void_likes',
        }),
      );
    });
  });

  describe('expireCreditBundles', () => {
    it('should paginate multiple batches and publish them to PubSub', async () => {
      // Arrange
      // First page with 100 users (equal to batch size), second page with 50 users (< batch size, terminates loop)
      const page1 = Array.from({ length: 100 }, (_, i) => ({
        userId: `user-${i + 1}`,
      }));
      const page2 = Array.from({ length: 50 }, (_, i) => ({
        userId: `user-${i + 101}`,
      }));

      (prisma.creditLedger.findMany as jest.Mock)
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2);

      // Act
      const result = await service.expireCreditBundles();

      // Assert
      expect(result).toEqual({
        batchesPublished: 2,
        totalUsersEnqueued: 150,
      });
      expect(pubSubPublisherMock.publish).toHaveBeenCalledTimes(2);
      expect(pubSubPublisherMock.publish).toHaveBeenNthCalledWith(
        1,
        PubSubTopic.CREDIT_EXPIRY,
        PubSubEvent.CREDIT_EXPIRY_BATCH,
        expect.objectContaining({
          userIds: expect.arrayContaining(['user-1', 'user-100']),
        }),
      );
      expect(pubSubPublisherMock.publish).toHaveBeenNthCalledWith(
        2,
        PubSubTopic.CREDIT_EXPIRY,
        PubSubEvent.CREDIT_EXPIRY_BATCH,
        expect.objectContaining({
          userIds: expect.arrayContaining(['user-101', 'user-150']),
        }),
      );
    });

    it('should finish immediately when no users have expired credit bundles', async () => {
      // Arrange
      (prisma.creditLedger.findMany as jest.Mock).mockResolvedValueOnce([]);

      // Act
      const result = await service.expireCreditBundles();

      // Assert
      expect(result).toEqual({
        batchesPublished: 0,
        totalUsersEnqueued: 0,
      });
      expect(pubSubPublisherMock.publish).not.toHaveBeenCalled();
    });

    it('should log and rethrow when database query fails during fan-out', async () => {
      // Arrange
      const dbError = new Error('Prisma read failure');
      (prisma.creditLedger.findMany as jest.Mock).mockRejectedValueOnce(
        dbError,
      );

      // Act & Assert
      await expect(service.expireCreditBundles()).rejects.toThrow(dbError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Credit expiry fan-out failed',
        expect.objectContaining({
          step: 'fan_out',
        }),
      );
    });
  });

  describe('expireSubscriptions', () => {
    it('should delegate to subscriptionsService.expireSubscriptions and return result', async () => {
      // Arrange
      const mockResult = { count: 3 };
      subscriptionsServiceMock.expireSubscriptions.mockResolvedValue(
        mockResult,
      );

      // Act
      const result = await service.expireSubscriptions();

      // Assert
      expect(
        subscriptionsServiceMock.expireSubscriptions,
      ).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResult);
    });

    it('should log and rethrow when subscriptionsService.expireSubscriptions fails', async () => {
      // Arrange
      const error = new Error('Subscription service error');
      subscriptionsServiceMock.expireSubscriptions.mockRejectedValue(error);

      // Act & Assert
      await expect(service.expireSubscriptions()).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Subscription expiry job failed',
        expect.objectContaining({
          step: 'expire_subscriptions',
        }),
      );
    });
  });

  describe('warnExpiringCreditBundles', () => {
    it('should paginate and publish warning batches to PubSub', async () => {
      // Arrange
      const page1 = [{ userId: 'user-w1' }, { userId: 'user-w2' }];
      (prisma.creditLedger.findMany as jest.Mock).mockResolvedValueOnce(page1);

      // Act
      const result = await service.warnExpiringCreditBundles();

      // Assert
      expect(result).toEqual({
        batchesPublished: 1,
        totalUsersEnqueued: 2,
      });
      expect(pubSubPublisherMock.publish).toHaveBeenCalledWith(
        PubSubTopic.CREDIT_EXPIRY,
        PubSubEvent.CREDIT_EXPIRY_WARNING_BATCH,
        expect.objectContaining({
          userIds: ['user-w1', 'user-w2'],
        }),
      );
    });

    it('should handle empty result when no bundles are expiring in 7 days', async () => {
      // Arrange
      (prisma.creditLedger.findMany as jest.Mock).mockResolvedValueOnce([]);

      // Act
      const result = await service.warnExpiringCreditBundles();

      // Assert
      expect(result).toEqual({
        batchesPublished: 0,
        totalUsersEnqueued: 0,
      });
      expect(pubSubPublisherMock.publish).not.toHaveBeenCalled();
    });

    it('should log and rethrow when warning query fails', async () => {
      // Arrange
      const dbError = new Error('Warning query error');
      (prisma.creditLedger.findMany as jest.Mock).mockRejectedValueOnce(
        dbError,
      );

      // Act & Assert
      await expect(service.warnExpiringCreditBundles()).rejects.toThrow(
        dbError,
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Credit expiry warning fan-out failed',
        expect.objectContaining({
          step: 'fan_out',
        }),
      );
    });
  });
});
