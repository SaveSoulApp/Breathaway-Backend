import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import {
  MissingPubSubConfigException,
  InvalidPubSubTokenException,
} from '../application/exceptions';
import { PubSubAuthGuard } from '../guards/pubsub-auth.guard';

describe('PubSubAuthGuard', () => {
  let guard: PubSubAuthGuard;
  let configService: jest.Mocked<ConfigService>;
  let contextualLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    verbose: jest.Mock;
  };
  let logger: {
    forContext: jest.Mock;
  };

  beforeEach(async () => {
    contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    logger = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        PubSubAuthGuard,
        { provide: LoggerService, useValue: logger },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    guard = module.get<PubSubAuthGuard>(PubSubAuthGuard);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockContext = (token: string | undefined): ExecutionContext => {
    return {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          query: {
            token,
          },
        }),
      }),
    } as unknown as ExecutionContext;
  };

  describe('canActivate', () => {
    it('should throw MissingPubSubConfigException if PUBSUB_VERIFICATION_TOKEN is not configured', () => {
      configService.get.mockReturnValue(undefined);
      const context = createMockContext('some_token');

      expect(() => guard.canActivate(context)).toThrow(
        MissingPubSubConfigException,
      );
      expect(() => guard.canActivate(context)).toThrow(
        'Server configuration error',
      );
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'PUBSUB_VERIFICATION_TOKEN is not configured',
        { step: 'auth_check' },
      );
    });

    it('should throw InvalidPubSubTokenException if request token is missing', () => {
      configService.get.mockReturnValue('valid_token');
      const context = createMockContext(undefined);

      expect(() => guard.canActivate(context)).toThrow(
        InvalidPubSubTokenException,
      );
      expect(() => guard.canActivate(context)).toThrow(
        'Invalid Pub/Sub verification token',
      );
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Unauthorized Pub/Sub ingest attempt: invalid or missing token',
        { step: 'auth_check' },
      );
    });

    it('should throw InvalidPubSubTokenException if request token does not match expected token', () => {
      configService.get.mockReturnValue('valid_token');
      const context = createMockContext('invalid_token');

      expect(() => guard.canActivate(context)).toThrow(
        InvalidPubSubTokenException,
      );
      expect(() => guard.canActivate(context)).toThrow(
        'Invalid Pub/Sub verification token',
      );
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Unauthorized Pub/Sub ingest attempt: invalid or missing token',
        { step: 'auth_check' },
      );
    });

    it('should return true if request token matches expected token', () => {
      configService.get.mockReturnValue('valid_token');
      const context = createMockContext('valid_token');

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });
});
