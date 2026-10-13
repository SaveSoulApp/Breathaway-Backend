import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LOG_EVENT, LoggerService } from '@core/logger';
import { PubSubEvent } from '@modules/pubsub/enums/pubsub-events.enum';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';

import { AuditService } from '../audit.service';
import { AuditActionType } from '../dto';

describe('AuditService (LOG-02)', () => {
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
      event: jest.fn(),
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
      expect((loggerService as any).event).toHaveBeenCalledWith(
        LOG_EVENT.AUDIT_EVENT_EMITTED,
        expect.objectContaining({
          userId: 'test-user-id',
          actionType: AuditActionType.USER_LOGIN,
        }),
      );
    });

    it('should sanitize PII and serialize errors in metadata before publishing to PubSub (LOG-02)', async () => {
      const thirdPartyError = new Error(
        'SMS gateway failure: https://api.gateway.com/send?phone=%2B919876543210&apiKey=secret_key',
      );

      const payload = {
        actionType: AuditActionType.USAGE_DENIED,
        userId: 'test-user-id',
        metadata: {
          reason: 'Failed delivery to alice@example.com (tel: +919876543210)',
          token: 'sensitive-jwt-token',
          password: 'rawPassword123',
          error: thirdPartyError,
          adminEmail: 'ops@breathaway.app',
        },
      };

      await service.handleAuditLogEvent(payload);

      expect(pubSubPublisher.publish).toHaveBeenCalledWith(
        'test-topic',
        PubSubEvent.SYSTEM_AUDIT_LOG,
        expect.objectContaining({
          actionType: AuditActionType.USAGE_DENIED,
          userId: 'test-user-id',
          metadata: expect.objectContaining({
            reason:
              'Failed delivery to [REDACTED_EMAIL] (tel: [REDACTED_PHONE])',
            token: '[Redacted]',
            password: '[Redacted]',
            adminEmail: 'ops@breathaway.app',
            error: expect.objectContaining({
              name: 'Error',
              message:
                'SMS gateway failure: https://api.gateway.com/send?phone=[REDACTED_PHONE]&apiKey=[REDACTED]',
            }),
          }),
        }),
        { actionType: AuditActionType.USAGE_DENIED },
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
        'Failed to publish audit event',
        expect.objectContaining({
          userId: 'test-user-id',
          actionType: AuditActionType.USER_LOGIN,
          step: 'publish_event',
          err: expect.objectContaining({ message: error.message }),
        }),
      );
    });
  });
});
