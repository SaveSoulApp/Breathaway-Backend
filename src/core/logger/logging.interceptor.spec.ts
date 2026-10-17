import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { lastValueFrom, throwError } from 'rxjs';

import {
  createMockCallHandler,
  createMockExecutionContext,
} from '@common/tests/mocks/execution-context.mock';

import { LoggerService } from './logger.service';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let clsService: { isActive: jest.Mock; get: jest.Mock };

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

  beforeEach(async () => {
    clsService = {
      isActive: jest.fn().mockReturnValue(true),
      get: jest.fn().mockReturnValue('req-uuid-123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoggingInterceptor,
        { provide: LoggerService, useValue: loggerServiceMock },
        { provide: ClsService, useValue: clsService },
      ],
    }).compile();

    interceptor = module.get<LoggingInterceptor>(LoggingInterceptor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should log incoming request and request completed at debug level on successful request', async () => {
    // Arrange
    const reqMock = {
      method: 'GET',
      url: '/api/v1/users',
      headers: { 'x-user-agent': 'iOS/1.0.0' },
      ip: '127.0.0.1',
    };
    const resMock = { statusCode: 200 };
    const context = createMockExecutionContext(
      reqMock,
      resMock,
      { name: 'getUsers' },
      { name: 'UsersController' },
    );
    const callHandler = createMockCallHandler({ data: [] });

    // Act
    const resultObservable = interceptor.intercept(context, callHandler);
    const result = await lastValueFrom(resultObservable);

    // Assert
    expect(result).toEqual({ data: [] });
    expect(loggerServiceMock.forContext).toHaveBeenCalledWith(
      'UsersController.getUsers',
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Incoming request',
      expect.objectContaining({
        requestId: 'req-uuid-123',
        httpRequest: {
          method: 'GET',
          url: '/api/v1/users',
          userAgent: 'iOS/1.0.0',
          remoteIp: '127.0.0.1',
        },
      }),
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Request completed',
      expect.objectContaining({
        requestId: 'req-uuid-123',
        statusCode: 200,
        httpRequest: { method: 'GET', url: '/api/v1/users' },
      }),
    );
    expect(mockLogger.event).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should propagate errors to the exception filter without logging errors in the interceptor', async () => {
    // Arrange
    const reqMock = {
      method: 'GET',
      url: '/api/v1/users/missing',
      headers: {},
      ip: '127.0.0.1',
    };
    const resMock = { statusCode: 404 };
    const context = createMockExecutionContext(
      reqMock,
      resMock,
      { name: 'getUser' },
      { name: 'UsersController' },
    );
    const error = new NotFoundException('User not found');
    const callHandler = {
      handle: () => throwError(() => error),
    };

    // Act & Assert
    await expect(
      lastValueFrom(interceptor.intercept(context, callHandler)),
    ).rejects.toThrow(error);

    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Incoming request',
      expect.any(Object),
    );
    // Interceptor must not log on error paths — GlobalExceptionFilter owns error-path logging
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.event).not.toHaveBeenCalled();
  });

  it('should fall back to standard user-agent header when x-user-agent is absent', async () => {
    // Arrange
    const reqMock = {
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Chrome)' },
      ip: '127.0.0.1',
    };
    const resMock = { statusCode: 200 };
    const context = createMockExecutionContext(
      reqMock,
      resMock,
      { name: 'checkHealth' },
      { name: 'HealthController' },
    );
    const callHandler = createMockCallHandler('ok');

    // Act
    await lastValueFrom(interceptor.intercept(context, callHandler));

    // Assert
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Incoming request',
      expect.objectContaining({
        httpRequest: expect.objectContaining({
          userAgent: 'Mozilla/5.0 (Macintosh; Chrome)',
        }),
      }),
    );
  });
});
