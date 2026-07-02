import { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';
import { LoggerService } from '@core/logger';

function mockArgumentsHost(mockResponse: object, url = '/test-path', method = 'GET'): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
      getRequest: () => ({ url, method }),
    }),
  } as unknown as ArgumentsHost;
}

describe('PrismaExceptionFilter', () => {
  let filter: PrismaExceptionFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock; type: jest.Mock };
  let loggerMock: ReturnType<jest.Mocked<LoggerService>['forContext']>;

  beforeEach(() => {
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
    };
    loggerMock = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(), log: jest.fn() } as any;

    filter = new PrismaExceptionFilter(
      { forContext: jest.fn().mockReturnValue(loggerMock) } as any,
      { isActive: jest.fn().mockReturnValue(true), get: jest.fn().mockReturnValue('req-id') } as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  const makePrismaError = (code: string, meta?: object) => {
    const err = new Prisma.PrismaClientKnownRequestError('DB error', {
      code,
      clientVersion: '5.0.0',
      meta,
    });
    return err;
  };

  it('should set Content-Type to application/problem+json', () => {
    filter.catch(makePrismaError('P2002'), mockArgumentsHost(mockResponse));
    expect(mockResponse.type).toHaveBeenCalledWith('application/problem+json');
  });

  it.each([
    ['P2002', 409, 'CONFLICT'],
    ['P2025', 404, 'NOT_FOUND'],
    ['P2003', 400, 'BAD_REQUEST'],
    ['P2000', 400, 'BAD_REQUEST'],
    ['P2014', 400, 'BAD_REQUEST'],
  ])('should map %s to status %d with type %s', (code, expectedStatus, expectedType) => {
    // Arrange
    const exception = makePrismaError(code);
    // Act
    filter.catch(exception, mockArgumentsHost(mockResponse));
    // Assert
    expect(mockResponse.status).toHaveBeenCalledWith(expectedStatus);
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      type: expectedType,
      status: expectedStatus,
    }));
  });

  it('should log known Prisma errors at warn, not error', () => {
    filter.catch(makePrismaError('P2002', { target: ['email'] }), mockArgumentsHost(mockResponse));
    expect(loggerMock.warn).toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it('should log unknown Prisma errors at error level', () => {
    filter.catch(makePrismaError('P9999'), mockArgumentsHost(mockResponse));
    expect(loggerMock.error).toHaveBeenCalled();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it('should return 500 for unknown Prisma error codes', () => {
    filter.catch(makePrismaError('P9999'), mockArgumentsHost(mockResponse));
    expect(mockResponse.status).toHaveBeenCalledWith(500);
  });

  it('should never include Prisma exception.message or meta in the response body', () => {
    // Arrange — meta contains field names (schema internals)
    filter.catch(
      makePrismaError('P2002', { target: ['email'], modelName: 'User' }),
      mockArgumentsHost(mockResponse),
    );
    // Assert — response body contains none of the Prisma internals
    const responseBody = mockResponse.json.mock.calls[0][0];
    expect(JSON.stringify(responseBody)).not.toContain('email');
    expect(JSON.stringify(responseBody)).not.toContain('User');
    expect(JSON.stringify(responseBody)).not.toContain('DB error');
  });
});
