import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerService } from '@core/logger';

import { NonProductionGuard } from '../../guards/non-production.guard';
import { createMockExecutionContext } from '../mocks/execution-context.mock';

describe('NonProductionGuard', () => {
  let guard: NonProductionGuard;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockLogger: {
    warn: jest.Mock;
    error: jest.Mock;
    info: jest.Mock;
  };

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    mockLogger = {
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    };

    const mockLoggerService = {
      forContext: jest.fn().mockReturnValue(mockLogger),
    } as unknown as LoggerService;

    guard = new NonProductionGuard(mockConfigService, mockLoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return true when running in development environment', () => {
    // Arrange
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'development';
      if (key === 'DEPLOYMENT_ENV') return 'development';
      return undefined;
    });

    const context = createMockExecutionContext({
      originalUrl: '/api/v1/admin/dev-login',
      method: 'POST',
      ip: '127.0.0.1',
    });

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when NODE_ENV is production', () => {
    // Arrange
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      if (key === 'DEPLOYMENT_ENV') return 'development';
      return undefined;
    });

    const context = createMockExecutionContext({
      originalUrl: '/api/v1/admin/dev-login',
      method: 'POST',
      ip: '10.0.0.1',
      headers: {},
    });

    // Act & Assert
    expect(() => guard.canActivate(context)).toThrow(NotFoundException);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Blocked attempt to access non-production endpoint in production environment',
      expect.objectContaining({
        step: 'non_production_blocked',
        route: '/api/v1/admin/dev-login',
        method: 'POST',
        nodeEnv: 'production',
        deploymentEnv: 'development',
        clientIp: '10.0.0.1',
      }),
    );
  });

  it('should throw NotFoundException when DEPLOYMENT_ENV is production', () => {
    // Arrange
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'development';
      if (key === 'DEPLOYMENT_ENV') return 'production';
      return undefined;
    });

    const context = createMockExecutionContext({
      originalUrl: '/api/v1/admin/database/truncate',
      method: 'POST',
      headers: {
        'x-forwarded-for': '198.51.100.1, 192.168.1.1',
      },
    });

    // Act & Assert
    expect(() => guard.canActivate(context)).toThrow(NotFoundException);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Blocked attempt to access non-production endpoint in production environment',
      expect.objectContaining({
        step: 'non_production_blocked',
        route: '/api/v1/admin/database/truncate',
        method: 'POST',
        clientIp: '198.51.100.1',
      }),
    );
  });

  it('should throw NotFoundException when environment variable contains uppercase or surrounding whitespace', () => {
    // Arrange
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return '  PRODUCTION  ';
      return undefined;
    });

    const context = createMockExecutionContext({
      url: '/admin/database/truncate',
      method: 'POST',
      headers: {},
    });

    // Act & Assert
    expect(() => guard.canActivate(context)).toThrow(NotFoundException);
  });
});
