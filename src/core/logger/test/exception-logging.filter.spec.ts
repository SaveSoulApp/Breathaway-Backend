import { DateUtil } from '@common/utils/date.utils';
import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ExceptionLoggingFilter } from '../exception-logging.filter';
import { LoggerService } from '../logger.service';

describe('ExceptionLoggingFilter', () => {
  let filter: ExceptionLoggingFilter;
  let mockLoggerService: jest.Mocked<LoggerService>;
  let mockContextualLogger: any;

  let mockResponse: any;
  let mockRequest: any;
  let mockArgumentsHost: jest.Mocked<ArgumentsHost>;

  beforeEach(() => {
    mockContextualLogger = {
      error: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    mockLoggerService = {
      forContext: jest.fn().mockReturnValue(mockContextualLogger),
    } as any;

    filter = new ExceptionLoggingFilter(mockLoggerService);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      method: 'GET',
      url: '/api/v1/test',
      headers: {
        'x-request-id': 'test-request-id',
      },
    };

    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as any;

    jest
      .spyOn(DateUtil, 'now')
      .mockReturnValue(new Date('2023-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should handle unhandled exceptions (500) and not expose details', () => {
    const error = new Error('Database connection failed');

    filter.catch(error, mockArgumentsHost);

    expect(mockContextualLogger.error).toHaveBeenCalledWith(
      'Request failed: GET /api/v1/test',
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: expect.objectContaining({
          message: 'Database connection failed',
        }),
      }),
    );

    expect(mockResponse.type).toHaveBeenCalledWith('application/problem+json');
    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockResponse.json).toHaveBeenCalledWith({
      type: 'INTERNAL_SERVER_ERROR',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'An unexpected error occurred.',
      instance: '/api/v1/test',
      timestamp: '2023-01-01T00:00:00.000Z',
    });
  });

  it('should handle generic HttpException', () => {
    const error = new HttpException('Forbidden access', HttpStatus.FORBIDDEN);

    filter.catch(error, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(mockResponse.json).toHaveBeenCalledWith({
      type: 'HTTPEXCEPTION',
      title: 'HttpException',
      status: HttpStatus.FORBIDDEN,
      detail: 'Forbidden access',
      instance: '/api/v1/test',
      timestamp: '2023-01-01T00:00:00.000Z',
    });
  });

  it('should handle BadRequestException with validation array', () => {
    const validationErrors = [
      'email must be an email',
      'password is too short',
    ];
    const error = new BadRequestException(validationErrors);

    filter.catch(error, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      type: 'BAD_REQUEST',
      title: 'Bad Request',
      status: HttpStatus.BAD_REQUEST,
      detail: 'One or more fields failed validation.',
      invalid_params: validationErrors,
      instance: '/api/v1/test',
      timestamp: '2023-01-01T00:00:00.000Z',
    });
  });
});
