import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { LoggerService } from '@core/logger';
import { ProfileAlreadyExistsException } from '../../modules/profiles/application/exceptions/profile-already-exists.exception';

function mockArgumentsHost(mockResponse: object, url = '/test-path', method = 'GET'): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
      getRequest: () => ({ url, method }),
    }),
  } as unknown as ArgumentsHost;
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock; type: jest.Mock };
  let loggerMock: ReturnType<jest.Mocked<LoggerService>['forContext']>;

  const clsMock = {
    isActive: jest.fn().mockReturnValue(true),
    get: jest.fn().mockReturnValue('test-request-id'),
  };

  beforeEach(() => {
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
    };
    loggerMock = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(), log: jest.fn() } as any;

    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue(loggerMock),
    } as unknown as jest.Mocked<LoggerService>;

    filter = new GlobalExceptionFilter(
      loggerServiceMock,
      { get: jest.fn().mockReturnValue('test') } as any,   // NODE_ENV = 'test'
      clsMock as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('RFC 7807 shape', () => {
    it('should set Content-Type to application/problem+json', () => {
      // Arrange
      const exception = new NotFoundException('Not found');
      // Act
      filter.catch(exception, mockArgumentsHost(mockResponse));
      // Assert
      expect(mockResponse.type).toHaveBeenCalledWith('application/problem+json');
    });

    it('should include requestId from CLS in the response', () => {
      filter.catch(new NotFoundException('x'), mockArgumentsHost(mockResponse));
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'test-request-id' }),
      );
    });
  });

  describe('HttpException', () => {
    it('should map NotFoundException to RFC 7807 404 shape', () => {
      // Arrange
      const exception = new NotFoundException('Profile not found');
      // Act
      filter.catch(exception, mockArgumentsHost(mockResponse));
      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        type: 'NOT_FOUND',
        title: 'Not Found',
        status: 404,
        detail: 'Profile not found',
        instance: '/test-path',
      }));
      expect(loggerMock.warn).toHaveBeenCalled();
      expect(loggerMock.error).not.toHaveBeenCalled();
    });

    it('should preserve invalid_params for class-validator errors', () => {
      // Arrange — ValidationPipe produces this shape
      const exception = new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: ['email must be an email', 'firstName should not be empty'],
      });
      // Act
      filter.catch(exception, mockArgumentsHost(mockResponse));
      // Assert
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        detail: 'One or more fields failed validation.',
        invalid_params: ['email must be an email', 'firstName should not be empty'],
      }));
    });
  });

  describe('DomainException', () => {
    it('should map a domain exception via the registry', () => {
      // Arrange
      const exception = new ProfileAlreadyExistsException('user-123');
      // Act
      filter.catch(exception, mockArgumentsHost(mockResponse));
      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        type: 'CONFLICT',
        status: 409,
      }));
    });
  });

  describe('Unexpected error', () => {
    it('should return 500 RFC 7807 shape and log at error level', () => {
      const exception = new Error('Database exploded');
      filter.catch(exception, mockArgumentsHost(mockResponse));

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        type: 'INTERNAL_SERVER_ERROR',
        status: 500,
      }));
      expect(loggerMock.error).toHaveBeenCalledWith(
        exception,
        expect.objectContaining({ statusCode: 500, requestId: 'test-request-id' }),
      );
    });

    it('should sanitize detail in production for 5xx', () => {
      // Arrange — production instance
      const prodFilter = new GlobalExceptionFilter(
        { forContext: jest.fn().mockReturnValue(loggerMock) } as any,
        { get: jest.fn().mockReturnValue('production') } as any,
        clsMock as any,
      );
      // Act
      prodFilter.catch(new Error('Sensitive internal detail'), mockArgumentsHost(mockResponse));
      // Assert
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        detail: 'An unexpected error occurred.',
      }));
    });

    it('should NOT sanitize 4xx detail in production', () => {
      // Arrange — 4xx in production should still return the real message
      const prodFilter = new GlobalExceptionFilter(
        { forContext: jest.fn().mockReturnValue(loggerMock) } as any,
        { get: jest.fn().mockReturnValue('production') } as any,
        clsMock as any,
      );
      // Act
      prodFilter.catch(new NotFoundException('Profile not found'), mockArgumentsHost(mockResponse));
      // Assert
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        detail: 'Profile not found',   // NOT sanitized — 4xx, not 5xx
      }));
    });
  });
});
