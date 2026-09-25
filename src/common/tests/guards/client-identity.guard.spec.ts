import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { LoggerService } from '@core/logger';

import { ClientIdentityGuard } from '../../guards/client-identity.guard';
import { createMockExecutionContext } from '../mocks/execution-context.mock';
import { ClsService } from 'nestjs-cls';

interface MockRequest {
  headers: Record<string, string | string[]>;
  clientIdentity?: unknown;
}

describe(ClientIdentityGuard.name, () => {
  let guard: ClientIdentityGuard;
  let reflector: jest.Mocked<Reflector>;
  let configService: jest.Mocked<ConfigService>;
  let logger: Record<string, jest.Mock>;

  beforeEach(async () => {
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
          if (key === 'REQUIRED_PLATFORMS') return '["iOS", "Android", "Web"]';
          if (key === 'MIN_APP_VERSION') return '1.0.0';
          if (key === 'APP_NAME') return 'TestApp';
          return defaultValue;
        }),
    } as unknown as jest.Mocked<ConfigService>;

    logger = {
      warn: jest.fn(),
      error: jest.fn(),
      forContext: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        ClientIdentityGuard,
        { provide: LoggerService, useValue: logger },
        { provide: Reflector, useValue: reflector },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    guard = module.get<ClientIdentityGuard>(ClientIdentityGuard);
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

  it('should throw BadRequestException if x-user-agent is missing', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockExecutionContext({
      headers: {
        'x-api-key': 'valid-api-key',
        'x-client-id': 'valid-client-id',
        'x-device-id': 'valid-device-id',
      },
    });

    expect(() => guard.canActivate(context)).toThrow(
      new BadRequestException('x-user-agent header is required'),
    );
  });

  it('should throw BadRequestException if x-user-agent format is invalid', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockExecutionContext({
      headers: {
        'x-api-key': 'valid-api-key',
        'x-client-id': 'valid-client-id',
        'x-device-id': 'valid-device-id',
        'x-user-agent': 'InvalidUserAgent',
      },
    });

    expect(() => guard.canActivate(context)).toThrow(
      new BadRequestException(
        'x-user-agent must follow format: TestApp/Version (Platform OSVersion; DeviceModel)',
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
        'x-user-agent': 'TestApp/1.0.0 (Windows 10; PC)',
      },
    });

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException(
        'Invalid platform. Supported: iOS, Android, Web',
      ),
    );
  });

  it('should throw UnauthorizedException if App Version is lower than minAppVersion', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockExecutionContext({
      headers: {
        'x-api-key': 'valid-api-key',
        'x-client-id': 'valid-client-id',
        'x-device-id': 'valid-device-id',
        'x-user-agent': 'TestApp/0.9.0 (ios 14.0; iPhone12)',
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
        'x-user-agent': 'TestApp/1.2.3 (ios 14.0; iPhone12)',
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
          'x-user-agent': 'TestApp/1.0.0 (ios 14.0; iPhone12)',
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
          'x-user-agent': 'TestApp/1.1.0 (ios 14.0; iPhone12)',
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
          'x-user-agent': 'TestApp/2.0.0 (ios 14.0; iPhone12)',
        },
      };
      const context = createMockExecutionContext(mockRequest);
      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe('Config Errors', () => {
    it('should handle unparseable JSON and initialize empty sets', async () => {
      const badConfigService = {
        get: jest
          .fn()
          .mockImplementation((key: string, defaultValue: unknown): unknown => {
            if (key === 'API_KEYS' || key === 'CLIENT_IDS')
              return 'invalid-json';
            return defaultValue;
          }),
      } as unknown as ConfigService;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ClientIdentityGuard,
          { provide: LoggerService, useValue: logger },
          { provide: Reflector, useValue: reflector },
          { provide: ConfigService, useValue: badConfigService },
        ],
      }).compile();

      guard = module.get<ClientIdentityGuard>(ClientIdentityGuard);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to parse config as JSON array',
        { envKey: 'API_KEYS', step: 'parse_config' },
      );
      expect(logger.warn).toHaveBeenCalledWith('No valid API keys configured', {
        step: 'init',
      });
    });

    it('should handle non-array JSON and initialize empty sets', async () => {
      const badConfigService = {
        get: jest
          .fn()
          .mockImplementation((key: string, defaultValue: unknown): unknown => {
            if (key === 'API_KEYS' || key === 'CLIENT_IDS')
              return '{"not": "array"}';
            return defaultValue;
          }),
      } as unknown as ConfigService;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ClientIdentityGuard,
          { provide: LoggerService, useValue: logger },
          { provide: Reflector, useValue: reflector },
          { provide: ConfigService, useValue: badConfigService },
        ],
      }).compile();

      guard = module.get<ClientIdentityGuard>(ClientIdentityGuard);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to parse config as JSON array',
        { envKey: 'API_KEYS', step: 'parse_config' },
      );
    });
  });

  describe('Web platform support', () => {
    it('should allow Web platform even if version is lower than minAppVersion', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'valid-api-key',
          'x-client-id': 'valid-client-id',
          'x-device-id': 'valid-device-id',
          'x-user-agent': 'TestApp/0.1.0 (Web macOS; Chrome)',
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
          version: '0.1.0',
          platform: 'web',
          osVersion: 'macOS',
          deviceModel: 'Chrome',
        },
      });
    });

    it('should allow Web platform with non-semver version string', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'valid-api-key',
          'x-client-id': 'valid-client-id',
          'x-device-id': 'valid-device-id',
          'x-user-agent': 'TestApp/web (Web Windows; Firefox)',
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
          version: 'web',
          platform: 'web',
          osVersion: 'Windows',
          deviceModel: 'Firefox',
        },
      });
    });

    it('should match platform case-insensitively and normalize to lowercase', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'valid-api-key',
          'x-client-id': 'valid-client-id',
          'x-device-id': 'valid-device-id',
          'x-user-agent': 'TestApp/1.0.0 (wEb macOS; Safari)',
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
          version: '1.0.0',
          platform: 'web',
          osVersion: 'macOS',
          deviceModel: 'Safari',
        },
      });
    });

    it('should parse standard browser user-agent header when x-user-agent is omitted', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'valid-api-key',
          'x-client-id': 'valid-client-id',
          'x-device-id': 'web-browser-device-id',
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
        },
      };
      const context = createMockExecutionContext(mockRequest);

      const result = guard.canActivate(context);
      expect(result).toBe(true);
      expect(mockRequest.clientIdentity).toEqual({
        apiKey: 'valid-api-key',
        clientId: 'valid-client-id',
        deviceId: 'web-browser-device-id',
        userAgent: {
          appName: 'TestApp',
          version: '1.0.0',
          platform: 'web',
          osVersion: 'macOS 10.15.7',
          deviceModel: 'Chrome 151.0.0.0',
        },
      });
    });

    it('should parse standard browser user-agent when passed via x-user-agent', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'valid-api-key',
          'x-client-id': 'valid-client-id',
          'x-device-id': 'web-browser-device-id',
          'x-user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      };
      const context = createMockExecutionContext(mockRequest);

      const result = guard.canActivate(context);
      expect(result).toBe(true);
      expect(mockRequest.clientIdentity).toEqual({
        apiKey: 'valid-api-key',
        clientId: 'valid-client-id',
        deviceId: 'web-browser-device-id',
        userAgent: {
          appName: 'TestApp',
          version: '1.0.0',
          platform: 'web',
          osVersion: 'Windows NT 10.0',
          deviceModel: 'Chrome 120.0.0.0',
        },
      });
    });
  });
});
