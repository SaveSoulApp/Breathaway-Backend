import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { LoggerService } from '@core/logger';

import { ClientIdentityGuard } from '../../guards/client-identity.guard';
import { createMockExecutionContext } from '../mocks/execution-context.mock';

interface MockRequest {
  headers: Record<string, string | string[]>;
  clientIdentity?: unknown;
}

describe('ClientIdentityGuard', () => {
  let guard: ClientIdentityGuard;
  let reflector: jest.Mocked<Reflector>;
  let configService: jest.Mocked<ConfigService>;
  let logger: Record<string, jest.Mock>;

  beforeEach(() => {
    reflector = {
      get: jest.fn(),
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue: unknown): unknown => {
          if (key === 'API_KEYS') return '["valid-api-key"]';
          if (key === 'CLIENT_IDS') return '["valid-client-id"]';
          if (key === 'REQUIRED_PLATFORMS') return '["ios", "android"]';
          if (key === 'MIN_APP_VERSION') return '1.0.0';
          if (key === 'APP_NAME') return 'TestApp';
          return defaultValue;
        }),
    } as unknown as jest.Mocked<ConfigService>;

    logger = {
      warn: jest.fn(),
      error: jest.fn(),
    };

    guard = new ClientIdentityGuard(
      logger as unknown as LoggerService,
      reflector,
      configService,
    );
  });

  it('should allow bypass if SKIP_CLIENT_IDENTITY_META is true', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockExecutionContext();

    const result = guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw UnauthorizedException if API Key is missing', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockExecutionContext({
      headers: {},
    });

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('x-api-key header is required'),
    );
  });

  it('should throw UnauthorizedException if API Key is invalid', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockExecutionContext({
      headers: {
        'x-api-key': 'invalid-key',
      },
    });

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Invalid API Key'),
    );
  });

  it('should throw BadRequestException if Client ID is missing', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockExecutionContext({
      headers: {
        'x-api-key': 'valid-api-key',
      },
    });

    expect(() => guard.canActivate(context)).toThrow(
      new BadRequestException('x-client-id header is required'),
    );
  });

  it('should throw UnauthorizedException if Client ID is invalid', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockExecutionContext({
      headers: {
        'x-api-key': 'valid-api-key',
        'x-client-id': 'invalid-client-id',
      },
    });

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Invalid Client ID'),
    );
  });

  it('should throw BadRequestException if Device ID is missing', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockExecutionContext({
      headers: {
        'x-api-key': 'valid-api-key',
        'x-client-id': 'valid-client-id',
      },
    });

    expect(() => guard.canActivate(context)).toThrow(
      new BadRequestException(
        'x-device-id header is required and must be a string',
      ),
    );
  });

  it('should throw BadRequestException if Device ID is not a string', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockExecutionContext({
      headers: {
        'x-api-key': 'valid-api-key',
        'x-client-id': 'valid-client-id',
        'x-device-id': ['array-device-id'],
      },
    });

    expect(() => guard.canActivate(context)).toThrow(
      new BadRequestException(
        'x-device-id header is required and must be a string',
      ),
    );
  });

  it('should throw BadRequestException if User-Agent is missing', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockExecutionContext({
      headers: {
        'x-api-key': 'valid-api-key',
        'x-client-id': 'valid-client-id',
        'x-device-id': 'valid-device-id',
      },
    });

    expect(() => guard.canActivate(context)).toThrow(
      new BadRequestException('User-Agent header is required'),
    );
  });

  it('should throw BadRequestException if User-Agent format is invalid', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockExecutionContext({
      headers: {
        'x-api-key': 'valid-api-key',
        'x-client-id': 'valid-client-id',
        'x-device-id': 'valid-device-id',
        'user-agent': 'InvalidUserAgent',
      },
    });

    expect(() => guard.canActivate(context)).toThrow(
      new BadRequestException(
        'User-Agent must follow format: TestApp/Version (Platform OSVersion; DeviceModel)',
      ),
    );
  });

  it('should throw UnauthorizedException if Platform is invalid', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockExecutionContext({
      headers: {
        'x-api-key': 'valid-api-key',
        'x-client-id': 'valid-client-id',
        'x-device-id': 'valid-device-id',
        'user-agent': 'TestApp/1.0.0 (Windows 10; PC)',
      },
    });

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Invalid platform. Supported: ios, android'),
    );
  });

  it('should throw UnauthorizedException if App Version is lower than minAppVersion', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockExecutionContext({
      headers: {
        'x-api-key': 'valid-api-key',
        'x-client-id': 'valid-client-id',
        'x-device-id': 'valid-device-id',
        'user-agent': 'TestApp/0.9.0 (ios 14.0; iPhone12)',
      },
    });

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('App version must be at least 1.0.0'),
    );
  });

  it('should succeed and attach clientIdentity to request if all headers are valid', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const mockRequest: MockRequest = {
      headers: {
        'x-api-key': 'valid-api-key',
        'x-client-id': 'valid-client-id',
        'x-device-id': 'valid-device-id',
        'user-agent': 'TestApp/1.2.3 (ios 14.0; iPhone12)',
      },
    };
    const context = createMockExecutionContext(mockRequest);

    const result = guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockRequest.clientIdentity).toEqual({
      apiKey: 'valid-api-key',
      clientId: 'valid-client-id',
      deviceId: 'valid-device-id',
      userAgent: {
        appName: 'TestApp',
        version: '1.2.3',
        platform: 'ios',
        osVersion: '14.0',
        deviceModel: 'iPhone12',
      },
    });
  });

  describe('isVersionValid edge cases', () => {
    it('should validate correctly for equal version', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'valid-api-key',
          'x-client-id': 'valid-client-id',
          'x-device-id': 'valid-device-id',
          'user-agent': 'TestApp/1.0.0 (ios 14.0; iPhone12)',
        },
      };
      const context = createMockExecutionContext(mockRequest);
      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should validate correctly for greater minor version', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'valid-api-key',
          'x-client-id': 'valid-client-id',
          'x-device-id': 'valid-device-id',
          'user-agent': 'TestApp/1.1.0 (ios 14.0; iPhone12)',
        },
      };
      const context = createMockExecutionContext(mockRequest);
      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should validate correctly for greater major version', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'valid-api-key',
          'x-client-id': 'valid-client-id',
          'x-device-id': 'valid-device-id',
          'user-agent': 'TestApp/2.0.0 (ios 14.0; iPhone12)',
        },
      };
      const context = createMockExecutionContext(mockRequest);
      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe('Config Errors', () => {
    it('should handle unparseable JSON and initialize empty sets', () => {
      const badConfigService = {
        get: jest
          .fn()
          .mockImplementation((key: string, defaultValue: unknown): unknown => {
            if (key === 'API_KEYS' || key === 'CLIENT_IDS')
              return 'invalid-json';
            return defaultValue;
          }),
      } as unknown as ConfigService;

      new ClientIdentityGuard(
        logger as unknown as LoggerService,
        reflector,
        badConfigService,
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to parse API_KEYS as JSON array. Check your environment variables.',
      );
      expect(logger.warn).toHaveBeenCalledWith('No valid API keys configured.');
    });

    it('should handle non-array JSON and initialize empty sets', () => {
      const badConfigService = {
        get: jest
          .fn()
          .mockImplementation((key: string, defaultValue: unknown): unknown => {
            if (key === 'API_KEYS' || key === 'CLIENT_IDS')
              return '{"not": "array"}';
            return defaultValue;
          }),
      } as unknown as ConfigService;

      new ClientIdentityGuard(
        logger as unknown as LoggerService,
        reflector,
        badConfigService,
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to parse API_KEYS as JSON array. Check your environment variables.',
      );
    });
  });
});
