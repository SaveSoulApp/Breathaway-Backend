# Exception Filters

Reference for the `GlobalExceptionFilter` and `PrismaExceptionFilter` — their full
implementations, the RFC 7807 response contract, registration order, logging integration,
and test patterns.

> **Project standard:** This codebase uses RFC 7807 Problem Details (`application/problem+json`)
> as its error response format. The existing `ExceptionLoggingFilter` established this standard.
> All new exception filters must produce the same RFC 7807 shape — never the generic NestJS
> `{ statusCode, error, message }` shape, which would create an inconsistent API contract.

---

## 1. RFC 7807 Error Response Shape (Project Standard)

Every error response from this API uses this shape and `Content-Type: application/problem+json`:

```json
{
  "type": "NOT_FOUND",
  "title": "Not Found",
  "status": 404,
  "detail": "No profile found for user abc-123",
  "instance": "/v1/profiles/abc-123",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

For validation errors (`400` from `class-validator`), the `invalid_params` field is added:

```json
{
  "type": "BAD_REQUEST",
  "title": "Bad Request",
  "status": 400,
  "detail": "One or more fields failed validation.",
  "instance": "/v1/profiles",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "invalid_params": ["email must be an email", "firstName should not be empty"]
}
```

**Field mapping from NestJS concepts:**

| RFC 7807 field   | Source                                                            |
| ---------------- | ----------------------------------------------------------------- |
| `type`           | Derived from exception name/error label — uppercased, underscored |
| `title`          | Human-readable error label (e.g., `"Not Found"`, `"Conflict"`)    |
| `status`         | HTTP status code (integer)                                        |
| `detail`         | The specific error message for this occurrence                    |
| `instance`       | `request.url` — the path that triggered the error                 |
| `timestamp`      | `DateUtil.now().toISOString()`                                    |
| `requestId`      | From `ClsService` (see `tracing-correlation.md`)                  |
| `invalid_params` | Optional — class-validator error array for 400 responses only     |

**`ErrorResponseDto` for Swagger** (cross-reference `api-design-expert`):

```typescript
export class ErrorResponseDto {
  @ApiProperty({ example: 'NOT_FOUND' })
  type: string;

  @ApiProperty({ example: 'Not Found' })
  title: string;

  @ApiProperty({ example: 404 })
  status: number;

  @ApiProperty({ example: 'No profile found for user abc-123' })
  detail: string;

  @ApiProperty({ example: '/v1/profiles/abc-123' })
  instance: string;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  requestId: string;

  @ApiPropertyOptional({ type: [String], example: ['email must be an email'] })
  invalid_params?: string[];
}
```

---

## 2. Registration Order in `main.ts`

```typescript
// main.ts
app.useGlobalFilters(
  new GlobalExceptionFilter(
    app.get(LoggerService),
    app.get(ConfigService),
    app.get(ClsService),
  ),
  new PrismaExceptionFilter(app.get(LoggerService), app.get(ClsService)),
);
```

**Order matters and is counterintuitive:** NestJS applies globally-registered exception filters
in reverse registration order — the last registered filter runs first. Registering
`GlobalExceptionFilter` first and `PrismaExceptionFilter` second means Prisma errors are
caught by `PrismaExceptionFilter` before they reach the global filter. If reversed, Prisma
errors fall through to `GlobalExceptionFilter` and log as unexpected 500s instead of their
correct mapped status codes.

---

## 3. `GlobalExceptionFilter`

This is an evolution of the existing `ExceptionLoggingFilter` — it preserves the RFC 7807
shape and `invalid_params` handling that the original got right, and adds: `requestId` from
CLS (not from the raw request header), `DomainException` support, and corrected log severity
(4xx at `warn`, 5xx at `error`).

```typescript
// core/filters/global-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import { DomainException } from '@shared/domain/exceptions/domain.exception';
import { DOMAIN_EXCEPTION_HTTP_MAP } from '@shared/domain/exceptions/domain-exception.map';

interface ResolvedError {
  status: number;
  type: string;
  title: string;
  detail: string;
  invalidParams?: string[];
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger;
  private readonly isProduction: boolean;

  constructor(
    loggerService: LoggerService,
    configService: ConfigService,
    private readonly cls: ClsService,
  ) {
    this.logger = loggerService.forContext(GlobalExceptionFilter.name);
    this.isProduction = configService.get('NODE_ENV') === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = this.cls.isActive()
      ? this.cls.get<string>('requestId')
      : undefined;

    const resolved = this.resolveException(exception);

    this.log(
      exception,
      resolved.status,
      request.method,
      request.url,
      requestId,
    );

    response
      .type('application/problem+json')
      .status(resolved.status)
      .json({
        type: resolved.type,
        title: resolved.title,
        status: resolved.status,
        detail: this.sanitizeDetail(resolved.status, resolved.detail),
        instance: request.url,
        timestamp: DateUtil.now().toISOString(),
        requestId,
        ...(resolved.invalidParams && {
          invalid_params: resolved.invalidParams,
        }),
      });
  }

  private resolveException(exception: unknown): ResolvedError {
    // 1. NestJS HttpException (current pragmatic pattern — services throw these directly)
    if (exception instanceof HttpException) {
      return this.resolveHttpException(exception);
    }

    // 2. Domain exception (target pattern — mapped via registry, see exception-hierarchy.md)
    if (exception instanceof DomainException) {
      return this.resolveDomainException(exception);
    }

    // 3. Truly unexpected — always 500
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      type: 'INTERNAL_SERVER_ERROR',
      title: 'Internal Server Error',
      detail: 'An unexpected error occurred.',
    };
  }

  private resolveHttpException(exception: HttpException): ResolvedError {
    const status = exception.getStatus();
    const rawResponse = exception.getResponse();

    // String response (e.g., throw new NotFoundException('Profile not found'))
    if (typeof rawResponse === 'string') {
      return {
        status,
        type: exception.name.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
        title: exception.name,
        detail: rawResponse,
      };
    }

    // Object response (NestJS default shape: { statusCode, error, message })
    if (rawResponse && typeof rawResponse === 'object') {
      const res = rawResponse as Record<string, unknown>;

      const title =
        typeof res.error === 'string'
          ? res.error
          : (exception.name ?? 'Http Exception');
      const type = title.toUpperCase().replace(/[^A-Z0-9]/g, '_');

      // class-validator produces message as string[] — preserve as invalid_params
      if (Array.isArray(res.message)) {
        return {
          status,
          type,
          title,
          detail: 'One or more fields failed validation.',
          invalidParams: res.message as string[],
        };
      }

      return {
        status,
        type,
        title,
        detail:
          typeof res.message === 'string'
            ? res.message
            : JSON.stringify(rawResponse),
      };
    }

    return {
      status,
      type: 'HTTP_EXCEPTION',
      title: 'Http Exception',
      detail: 'An error occurred.',
    };
  }

  private resolveDomainException(exception: DomainException): ResolvedError {
    const status =
      DOMAIN_EXCEPTION_HTTP_MAP[exception.name] ??
      HttpStatus.INTERNAL_SERVER_ERROR;
    const title = HttpStatus[status]?.replace(/_/g, ' ') ?? 'Error';
    const type = title.toUpperCase().replace(/[^A-Z0-9]/g, '_');

    return { status, type, title, detail: exception.message };
  }

  private sanitizeDetail(status: number, detail: string): string {
    // Never expose internal detail for 5xx errors in production
    if (this.isProduction && status >= 500) {
      return 'An unexpected error occurred.';
    }
    return detail;
  }

  private log(
    exception: unknown,
    status: number,
    method: string,
    url: string,
    requestId: string | undefined,
  ): void {
    const meta = { requestId, statusCode: status };

    if (status >= 500) {
      // Full error object — LoggerService.write() serializes the stack trace automatically
      this.logger.error(
        exception instanceof Error ? exception : new Error(String(exception)),
        { ...meta, method, url },
      );
    } else {
      // 4xx — expected client error, log at warn with message only (no stack trace needed)
      const message =
        exception instanceof Error ? exception.message : String(exception);
      this.logger.warn(`Request failed: ${method} ${url}`, {
        ...meta,
        error: message,
      });
    }
  }
}
```

**Key decisions carried over from the original `ExceptionLoggingFilter`:**

- `response.type('application/problem+json')` — preserved from the original; clients checking
  `Content-Type` on error responses get the correct RFC 7807 content type.
- `invalid_params` for validation arrays — preserved from the original; do not collapse the
  class-validator array into a joined string, which loses structured field-level error info.
- 500 `detail` sanitization in production — preserved from the original; hides internal detail
  from the client while logging it server-side.

**What changed vs the original `ExceptionLoggingFilter`:**

- `requestId` now read from `ClsService` instead of `request.headers['x-request-id']`
  directly — CLS guarantees an ID is present even when no incoming header was provided.
- Log severity split: 4xx at `warn`, 5xx at `error` — the original logged everything at
  `error`, which means a `NotFoundException` triggered `error`-level alerts.
- `DomainException` branch added — supports the target pattern as services migrate.
- `method` included in log metadata — helps diagnose issues, especially for non-GET requests.

---

## 4. `PrismaExceptionFilter`

Catches `PrismaClientKnownRequestError` before it reaches `GlobalExceptionFilter`, maps known
error codes to the correct HTTP status, and responds in RFC 7807 shape to match the rest of
the API. Raw Prisma error messages and schema internals never reach the client.

```typescript
// infrastructure/database/filters/prisma-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';

interface PrismaErrorMapping {
  status: HttpStatus;
  type: string;
  title: string;
  detail: string;
}

const PRISMA_ERROR_MAP: Record<string, PrismaErrorMapping> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    type: 'CONFLICT',
    title: 'Conflict',
    detail: 'A record with this value already exists.',
  },
  P2025: {
    status: HttpStatus.NOT_FOUND,
    type: 'NOT_FOUND',
    title: 'Not Found',
    detail: 'The requested record was not found.',
  },
  P2003: {
    status: HttpStatus.BAD_REQUEST,
    type: 'BAD_REQUEST',
    title: 'Bad Request',
    detail: 'A related record constraint was violated.',
  },
  P2000: {
    status: HttpStatus.BAD_REQUEST,
    type: 'BAD_REQUEST',
    title: 'Bad Request',
    detail: 'The provided value is too long for this field.',
  },
  P2014: {
    status: HttpStatus.BAD_REQUEST,
    type: 'BAD_REQUEST',
    title: 'Bad Request',
    detail: 'A relation constraint was violated.',
  },
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger;

  constructor(
    loggerService: LoggerService,
    private readonly cls: ClsService,
  ) {
    this.logger = loggerService.forContext(PrismaExceptionFilter.name);
  }

  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = this.cls.isActive()
      ? this.cls.get<string>('requestId')
      : undefined;

    const mapped = PRISMA_ERROR_MAP[exception.code];
    const status = mapped?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (mapped) {
      // Known constraint — expected, log at warn
      this.logger.warn(`Prisma ${exception.code}: ${mapped.detail}`, {
        prismaCode: exception.code,
        prismaMeta: exception.meta, // field name etc. — safe to log, not to send to client
        requestId,
        path: request.url,
      });
    } else {
      // Unknown Prisma error — unexpected, log at error with full exception
      this.logger.error(exception, {
        prismaCode: exception.code,
        requestId,
        path: request.url,
      });
    }

    response
      .type('application/problem+json')
      .status(status)
      .json({
        type: mapped?.type ?? 'INTERNAL_SERVER_ERROR',
        title: mapped?.title ?? 'Internal Server Error',
        status,
        detail: mapped?.detail ?? 'An unexpected database error occurred.',
        instance: request.url,
        timestamp: DateUtil.now().toISOString(),
        requestId,
      });
  }
}
```

**Rules:**

- `exception.meta` (contains the violating field name for P2002, constraint name for P2003,
  etc.) is logged server-side only — it must never appear in the response body.
- `exception.message` from Prisma contains table names, column names, and query fragments —
  never surface it in the response, even in development; log it server-side instead.
- Unknown Prisma error codes return a sanitized 500 — do not fall through to
  `GlobalExceptionFilter` (the `@Catch` decorator on this filter is specific to
  `PrismaClientKnownRequestError`; `PrismaClientUnknownRequestError` is separate and will
  fall through to `GlobalExceptionFilter`'s unexpected-500 path, which is correct).

---

## 5. Log Level Decision Guide

| Condition                                                                               | Level   | Where                         |
| --------------------------------------------------------------------------------------- | ------- | ----------------------------- |
| Expected business rule violation (conflict, not found) — thrown as NestJS HttpException | `warn`  | `GlobalExceptionFilter`       |
| Expected Prisma constraint violation (P2002, P2025, P2003)                              | `warn`  | `PrismaExceptionFilter`       |
| Domain exception mapped to 4xx                                                          | `warn`  | `GlobalExceptionFilter`       |
| Unknown/unmapped Prisma error                                                           | `error` | `PrismaExceptionFilter`       |
| Truly unexpected error (unhandled exception, 5xx)                                       | `error` | `GlobalExceptionFilter`       |
| External API call failure after exhausting retries                                      | `error` | Service (owns retry logic)    |
| External API call failure on a non-final retry attempt                                  | `warn`  | Service                       |
| **Never** — unexpected error caught-and-swallowed in a service                          | —       | Services rethrow; filter logs |

The goal: services contain minimal `catch` blocks, and when they catch, they rethrow.
The filter pair is the single logging point for exception outcomes.

---

## 6. Testing Exception Filters

Filters are standalone classes — no full NestJS module needed, just mocked dependencies.
Mock the `ArgumentsHost` in the same way both filter specs use:

```typescript
// Shared test helper — put in test/helpers/ or inline per spec
function mockArgumentsHost(
  mockResponse: object,
  url = '/test-path',
  method = 'GET',
): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
      getRequest: () => ({ url, method }),
    }),
  } as unknown as ArgumentsHost;
}
```

### `GlobalExceptionFilter` spec

```typescript
// core/filters/global-exception.filter.spec.ts
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
    loggerMock = {
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
    };

    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue(loggerMock),
    } as unknown as jest.Mocked<LoggerService>;

    filter = new GlobalExceptionFilter(
      loggerServiceMock,
      { get: jest.fn().mockReturnValue('test') } as any, // NODE_ENV = 'test'
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
      expect(mockResponse.type).toHaveBeenCalledWith(
        'application/problem+json',
      );
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
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'NOT_FOUND',
          title: 'Not Found',
          status: 404,
          detail: 'Profile not found',
          instance: '/test-path',
        }),
      );
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
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'One or more fields failed validation.',
          invalid_params: [
            'email must be an email',
            'firstName should not be empty',
          ],
        }),
      );
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
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CONFLICT',
          status: 409,
        }),
      );
    });
  });

  describe('Unexpected error', () => {
    it('should return 500 RFC 7807 shape and log at error level', () => {
      const exception = new Error('Database exploded');
      filter.catch(exception, mockArgumentsHost(mockResponse));

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INTERNAL_SERVER_ERROR',
          status: 500,
        }),
      );
      expect(loggerMock.error).toHaveBeenCalledWith(
        exception,
        expect.objectContaining({
          statusCode: 500,
          requestId: 'test-request-id',
        }),
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
      prodFilter.catch(
        new Error('Sensitive internal detail'),
        mockArgumentsHost(mockResponse),
      );
      // Assert
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'An unexpected error occurred.',
        }),
      );
    });

    it('should NOT sanitize 4xx detail in production', () => {
      // Arrange — 4xx in production should still return the real message
      const prodFilter = new GlobalExceptionFilter(
        { forContext: jest.fn().mockReturnValue(loggerMock) } as any,
        { get: jest.fn().mockReturnValue('production') } as any,
        clsMock as any,
      );
      // Act
      prodFilter.catch(
        new NotFoundException('Profile not found'),
        mockArgumentsHost(mockResponse),
      );
      // Assert
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'Profile not found', // NOT sanitized — 4xx, not 5xx
        }),
      );
    });
  });
});
```

### `PrismaExceptionFilter` spec

```typescript
// infrastructure/database/filters/prisma-exception.filter.spec.ts
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
    loggerMock = {
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
    };

    filter = new PrismaExceptionFilter(
      { forContext: jest.fn().mockReturnValue(loggerMock) } as any,
      {
        isActive: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue('req-id'),
      } as any,
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
  ])(
    'should map %s to status %d with type %s',
    (code, expectedStatus, expectedType) => {
      // Arrange
      const exception = makePrismaError(code);
      // Act
      filter.catch(exception, mockArgumentsHost(mockResponse));
      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(expectedStatus);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          type: expectedType,
          status: expectedStatus,
        }),
      );
    },
  );

  it('should log known Prisma errors at warn, not error', () => {
    filter.catch(
      makePrismaError('P2002', { target: ['email'] }),
      mockArgumentsHost(mockResponse),
    );
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
```

The last test — asserting Prisma internals are absent from the response body — is a security
requirement per `security-reviewer`, not just a formatting preference. It must exist in the
spec and must not be removed.
