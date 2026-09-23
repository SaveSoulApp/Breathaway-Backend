import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { LikeStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { CreditsService } from '@modules/credits/credits.service';
import { NotificationType } from '@modules/notifications/enums/notification-type.enum';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { SubscriptionsService } from '@modules/subscriptions/services/subscriptions.service';

import { MaintenanceService } from '../maintenance.service';

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let prisma: MockPrismaService;
  let notificationsServiceMock: { dispatch: jest.Mock };

  beforeEach(async () => {
    notificationsServiceMock = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: PrismaService, useValue: createPrismaMock() },
        {
          provide: CreditsService,
          useValue: { expireCreditsForUsers: jest.fn() },
        },
        {
          provide: SubscriptionsService,
          useValue: { sweepExpiredSubscriptions: jest.fn() },
        },
        { provide: PubSubPublisherService, useValue: { publish: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(100) },
        },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    service = module.get<MaintenanceService>(MaintenanceService);
    prisma = module.get(PrismaService);
  });

  describe('voidPendingLikes', () => {
    it('should void likes older than 90 days and dispatch LIKES_EXPIRED notifications', async () => {
      (prisma.like.groupBy as jest.Mock).mockResolvedValueOnce([
        {
          senderUserId: 'user-1',
          _count: { id: 3 },
        },
      ]);
      (prisma.like.updateMany as jest.Mock).mockResolvedValueOnce({ count: 3 });
      (prisma.userProfile.findUnique as jest.Mock).mockResolvedValueOnce({
        firstName: 'Alice',
      });

      const result = await service.voidPendingLikes();

      expect(result).toEqual({ voidedCount: 3 });
      expect(prisma.like.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: LikeStatus.PENDING,
          }),
          data: { status: LikeStatus.VOIDED },
        }),
      );

      await new Promise((resolve) => setImmediate(resolve));

      expect(notificationsServiceMock.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.LIKES_EXPIRED,
          userIds: ['user-1'],
          payload: expect.objectContaining({
            name: 'Alice',
            count: 3,
          }),
        }),
      );
    });

    it('should handle zero expiring likes gracefully', async () => {
      (prisma.like.groupBy as jest.Mock).mockResolvedValueOnce([]);
      (prisma.like.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

      const result = await service.voidPendingLikes();

      expect(result).toEqual({ voidedCount: 0 });
      expect(notificationsServiceMock.dispatch).not.toHaveBeenCalled();
    });
  });
});
