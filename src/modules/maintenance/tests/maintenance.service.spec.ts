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
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { SubscriptionsService } from '@modules/subscriptions/services/subscriptions.service';

import { LIKES_EXPIRED_EVENT } from '../events';
import { MaintenanceService } from '../maintenance.service';

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let prisma: MockPrismaService;
  let eventEmitterMock: { emit: jest.Mock };

  beforeEach(async () => {
    eventEmitterMock = { emit: jest.fn() };

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
        { provide: EventEmitter2, useValue: eventEmitterMock },
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
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    service = module.get<MaintenanceService>(MaintenanceService);
    prisma = module.get(PrismaService);
  });

  describe('voidPendingLikes', () => {
    it('should void likes older than 90 days and emit LIKES_EXPIRED event', async () => {
      (prisma.like.groupBy as jest.Mock).mockResolvedValueOnce([
        {
          senderUserId: 'user-1',
          _count: { id: 3 },
        },
      ]);
      (prisma.like.updateMany as jest.Mock).mockResolvedValueOnce({ count: 3 });

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

      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        LIKES_EXPIRED_EVENT,
        expect.objectContaining({
          userId: 'user-1',
          count: 3,
        }),
      );
    });

    it('should handle zero expiring likes gracefully', async () => {
      (prisma.like.groupBy as jest.Mock).mockResolvedValueOnce([]);
      (prisma.like.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

      const result = await service.voidPendingLikes();

      expect(result).toEqual({ voidedCount: 0 });
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });
  });
});
