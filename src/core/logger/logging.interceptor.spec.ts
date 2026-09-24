import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { lastValueFrom, throwError } from 'rxjs';

import {
  createMockCallHandler,
  createMockExecutionContext,
} from '@common/tests/mocks/execution-context.mock';

import { LOG_EVENT } from './log-event.constants';
import { LoggerService } from './logger.service';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let clsService: { get: jest.Mock };

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

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test'),
  };

  beforeEach(async () => {
    clsService = {
      get: jest.fn().mockReturnValue('req-uuid-123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoggingInterceptor,
        { provide: LoggerService, useValue: loggerServiceMock },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ClsService, useValue: clsService },
      ],
    }).compile();

    interceptor = module.get<LoggingInterceptor>(LoggingInterceptor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should log REQUEST_RECEIVED and REQUEST_COMPLETED on successful request', async () => {
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
    expect(mockLogger.event).toHaveBeenCalledWith(
      LOG_EVENT.REQUEST_RECEIVED,
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
    expect(mockLogger.event).toHaveBeenCalledWith(
      LOG_EVENT.REQUEST_COMPLETED,
      expect.objectContaining({
        requestId: 'req-uuid-123',
        statusCode: 200,
        httpRequest: { method: 'GET', url: '/api/v1/users' },
      }),
    );
  });

  it('should log warn when a 4xx exception is thrown and rethrow', async () => {
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

    expect(mockLogger.warn).toHaveBeenCalledWith(
      { event: LOG_EVENT.REQUEST_FAILED },
      expect.objectContaining({
        requestId: 'req-uuid-123',
        statusCode: 404,
        httpRequest: { method: 'GET', url: '/api/v1/users/missing' },
      }),
    );
  });

  it('should log error when an unhandled 500 error is thrown and rethrow', async () => {
    // Arrange
    const reqMock = {
      method: 'POST',
      url: '/api/v1/likes',
      headers: {},
      ip: '127.0.0.1',
    };
    const resMock = { statusCode: 500 };
    const context = createMockExecutionContext(
      reqMock,
      resMock,
      { name: 'create' },
      { name: 'LikesController' },
    );
    const unhandledError = new Error('Database connection failed');
    const callHandler = {
      handle: () => throwError(() => unhandledError),
    };

    // Act & Assert
    await expect(
      lastValueFrom(interceptor.intercept(context, callHandler)),
    ).rejects.toThrow(unhandledError);

    expect(mockLogger.error).toHaveBeenCalledWith(
      { event: LOG_EVENT.REQUEST_FAILED },
      expect.objectContaining({
        requestId: 'req-uuid-123',
        statusCode: 500,
        httpRequest: { method: 'POST', url: '/api/v1/likes' },
      }),
    );
  });
});
