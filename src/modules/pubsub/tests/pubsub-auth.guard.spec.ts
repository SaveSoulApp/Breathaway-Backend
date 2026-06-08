import { EventEmitter2 } from '@nestjs/event-emitter';
import { LoggerService } from '@core/logger';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PubSubAuthGuard } from '../guards/pubsub-auth.guard';

describe('PubSubAuthGuard', () => {
  let guard: PubSubAuthGuard;
  let configService: jest.Mocked<ConfigService>;
  let logger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    verbose: jest.Mock;
  };

  beforeEach(async () => {
    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
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
    it('should throw UnauthorizedException if PUBSUB_VERIFICATION_TOKEN is not configured', () => {
      configService.get.mockReturnValue(undefined);
      const context = createMockContext('some_token');

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Server configuration error',
      );
      expect(logger.error).toHaveBeenCalledWith(
        'PUBSUB_VERIFICATION_TOKEN is not configured in the environment.',
      );
    });

    it('should throw UnauthorizedException if request token is missing', () => {
      configService.get.mockReturnValue('valid_token');
      const context = createMockContext(undefined);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Invalid Pub/Sub verification token',
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'Unauthorized Pub/Sub ingest attempt. Invalid or missing token.',
      );
    });

    it('should throw UnauthorizedException if request token does not match expected token', () => {
      configService.get.mockReturnValue('valid_token');
      const context = createMockContext('invalid_token');

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Invalid Pub/Sub verification token',
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'Unauthorized Pub/Sub ingest attempt. Invalid or missing token.',
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
