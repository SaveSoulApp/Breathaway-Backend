import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { AUDIT_LOG_EVENT } from '@modules/audit/constants/audit.constants';
import { AuditActionType, AuditEventRequestDto } from '@modules/audit/dto';

import { BaseController } from '../base.controller';
import { BaseFilter } from '../base.filter';
import { BaseGuard } from '../base.guard';
import { BaseHandler } from '../base.handler';
import { BaseInterceptor } from '../base.interceptor';
import { BaseService } from '../base.service';

import { Injectable } from '@nestjs/common';

class TestController extends BaseController {}
class TestFilter extends BaseFilter {}
class TestGuard extends BaseGuard {}
class TestHandler extends BaseHandler {}
class TestInterceptor extends BaseInterceptor {}

@Injectable()
class TestService extends BaseService {
  constructor(loggerService: LoggerService) {
    super(loggerService);
  }

  public triggerAudit(payload: AuditEventRequestDto) {
    this.emitAuditLog(payload);
  }
}

describe('Core Base Classes', () => {
  let loggerServiceMock: { forContext: jest.Mock };
  let contextualLogger: Record<string, jest.Mock>;

  beforeEach(() => {
    contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    loggerServiceMock = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('BaseController should initialize contextual logger with its class name', () => {
    new TestController(loggerServiceMock as unknown as LoggerService);
    expect(loggerServiceMock.forContext).toHaveBeenCalledWith('TestController');
  });

  it('BaseFilter should initialize contextual logger with its class name', () => {
    new TestFilter(loggerServiceMock as unknown as LoggerService);
    expect(loggerServiceMock.forContext).toHaveBeenCalledWith('TestFilter');
  });

  it('BaseGuard should initialize contextual logger with its class name', () => {
    new TestGuard(loggerServiceMock as unknown as LoggerService);
    expect(loggerServiceMock.forContext).toHaveBeenCalledWith('TestGuard');
  });

  it('BaseHandler should initialize contextual logger with its class name', () => {
    new TestHandler(loggerServiceMock as unknown as LoggerService);
    expect(loggerServiceMock.forContext).toHaveBeenCalledWith('TestHandler');
  });

  it('BaseInterceptor should initialize contextual logger with its class name', () => {
    new TestInterceptor(loggerServiceMock as unknown as LoggerService);
    expect(loggerServiceMock.forContext).toHaveBeenCalledWith(
      'TestInterceptor',
    );
  });

  describe('BaseService', () => {
    let service: TestService;
    let eventEmitterMock: { emit: jest.Mock };
    let clsServiceMock: { get: jest.Mock };

    beforeEach(async () => {
      eventEmitterMock = { emit: jest.fn() };
      clsServiceMock = {
        get: jest.fn((key: string) => {
          if (key === 'ipAddress') return '192.168.1.1';
          if (key === 'userAgent') return 'TestAgent/1.0';
          if (key === 'requestId') return 'req-cls-999';
          return undefined;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TestService,
          { provide: ClsService, useValue: clsServiceMock },
          { provide: EventEmitter2, useValue: eventEmitterMock },
          {
            provide: LoggerService,
            useValue: loggerServiceMock as unknown as LoggerService,
          },
        ],
      }).compile();

      service = module.get<TestService>(TestService);
    });

    it('should initialize contextual logger with class name', () => {
      expect(loggerServiceMock.forContext).toHaveBeenCalledWith('TestService');
    });

    it('should enrich and emit audit log with CLS values', () => {
      const payload: AuditEventRequestDto = {
        actionType: AuditActionType.USER_LOGIN,
        userId: 'user-base-1',
        metadata: { customField: 'value' },
      };

      service.triggerAudit(payload);

      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        AUDIT_LOG_EVENT,
        expect.objectContaining({
          actionType: AuditActionType.USER_LOGIN,
          userId: 'user-base-1',
          ipAddress: '192.168.1.1',
          metadata: {
            customField: 'value',
            userAgent: 'TestAgent/1.0',
            requestId: 'req-cls-999',
          },
        }),
      );
    });

    it('should preserve explicit ipAddress in payload over CLS', () => {
      const payload: AuditEventRequestDto = {
        actionType: AuditActionType.USER_LOGIN,
        userId: 'user-base-1',
        ipAddress: '10.0.0.1',
      };

      service.triggerAudit(payload);

      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        AUDIT_LOG_EVENT,
        expect.objectContaining({
          ipAddress: '10.0.0.1',
        }),
      );
    });
  });
});
