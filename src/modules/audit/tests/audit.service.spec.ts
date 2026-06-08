import { LoggerService } from '@core/logger';
import { PubSubEvent } from '@modules/pubsub/enums/pubsub-events.enum';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { AuditService } from '../audit.service';
import { AuditActionType } from '../dto/audit-event.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('AuditService', () => {
  let service: AuditService;
  let pubSubPublisher: PubSubPublisherService;
  let loggerService: LoggerService;

  beforeEach(async () => {
    const mockPubSubPublisher = {
      publish: jest.fn(),
    };

    const mockLoggerService = {
      forContext: jest.fn().mockReturnThis(),
      debug: jest.fn(),
      error: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'AUDIT_PUBSUB_TOPIC') return 'test-topic';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PubSubPublisherService, useValue: mockPubSubPublisher },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    pubSubPublisher = module.get<PubSubPublisherService>(
      PubSubPublisherService,
    );
    loggerService = module.get<LoggerService>(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleAuditLogEvent', () => {
    it('should publish the audit log to PubSub successfully', async () => {
      const payload = {
        actionType: AuditActionType.USER_LOGIN,
        userId: 'test-user-id',
        ipAddress: '127.0.0.1',
      };

      await service.handleAuditLogEvent(payload);

      expect(pubSubPublisher.publish).toHaveBeenCalledWith(
        'test-topic',
        PubSubEvent.SYSTEM_AUDIT_LOG,
        payload,
        { actionType: AuditActionType.USER_LOGIN },
      );
      expect(loggerService.debug).toHaveBeenCalledWith(
        `Audit event published: USER_LOGIN for user test-user-id`,
      );
    });

    it('should log an error if publishing fails', async () => {
      const payload = {
        actionType: AuditActionType.USER_LOGIN,
        userId: 'test-user-id',
      };
      const error = new Error('Publish error');

      jest.spyOn(pubSubPublisher, 'publish').mockRejectedValue(error);

      await service.handleAuditLogEvent(payload);

      expect(loggerService.error).toHaveBeenCalledWith(
        `Failed to publish audit event: Publish error`,
        { stack: error.stack },
      );
    });
  });
});
