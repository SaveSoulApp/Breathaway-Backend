# Exception Filters

Reference for the `GlobalExceptionFilter` and `PrismaExceptionFilter` — their full
implementations, registration order, logging integration, and test patterns.

---

## 1. Registration Order in `main.ts`

```typescript
// main.ts
app.useGlobalFilters(
  new GlobalExceptionFilter(
    app.get(LoggerService),
    app.get(ConfigService),
    app.get(ClsService),
  ),
  new PrismaExceptionFilter(
    app.get(LoggerService),
    app.get(ClsService),
  ),
);
```

**Order matters and is counterintuitive:** NestJS applies globally-registered exception filters
in reverse registration order — the last registered filter runs first. So registering
`GlobalExceptionFilter` first and `PrismaExceptionFilter` second means Prisma errors are
caught by `PrismaExceptionFilter` before they reach the global one. If you reverse the order,
Prisma errors hit `GlobalExceptionFilter` and are logged as unexpected 500s instead of being
mapped to their correct 409/404/400 codes.

---

## 2. `PrismaExceptionFilter`

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

const PRISMA_ERROR_MAP: Record<string, { status: HttpStatus; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT,     message: 'A record with this value already exists' },
  P2025: { status: HttpStatus.NOT_FOUND,    message: 'The requested record was not found' },
  P2003: { status: HttpStatus.BAD_REQUEST,  message: 'Related record constraint violation' },
  P2000: { status: HttpStatus.BAD_REQUEST,  message: 'Input value is too long for this field' },
  P2014: { status: HttpStatus.BAD_REQUEST,  message: 'Relation violation' },
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger;

  constructor(
    loggerService: LoggerService,
    private readonly cls: ClsService,
  ) {
    this.logger = loggerService.forContext('PrismaExceptionFilter');
  }

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const mapped = PRISMA_ERROR_MAP[exception.code];
    const status = mapped?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const message = mapped?.message ?? 'An unexpected database error occurred';
    const requestId = this.cls.isActive() ? this.cls.get('requestId') : undefined;

    // Log at warn for known/mapped errors, error for unmapped
    if (mapped) {
      this.logger.warn(`Prisma ${exception.code}: ${message}`, {
        prismaCode: exception.code,
        meta: exception.meta,
        requestId,
        path: request.url,
      });
    } else {
      this.logger.error(exception, {
        prismaCode: exception.code,
        requestId,
        path: request.url,
      });
    }

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status].replace(/_/g, ' '),
      message,
      requestId,
      timestamp: DateUtil.now().toISOString(),
      path: request.url,
    });
  }
}
```

**Rules:**
- Map known Prisma codes at `warn` level (expected database constraints, not application bugs).
- Log unmapped Prisma errors at `error` (unexpected, possibly schema mismatch or corruption).
- Never surface Prisma's raw `exception.message` in the response — it contains schema
  internals and full table/column names that must not reach the client.
- `exception.meta` (which contains the violating field name for P2002, etc.) can be logged
  server-side but must not be included in the response body.

---

## 3. `GlobalExceptionFilter`

```typescript
// core/filters/global-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import { DomainException } from '@shared/domain/exceptions/domain.exception';
import { DOMAIN_EXCEPTION_HTTP_MAP } from '@shared/domain/exceptions/domain-exception.map';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger;
  private readonly isProduction: boolean;

  constructor(
    loggerService: LoggerService,
    configService: ConfigService,
    private readonly cls: ClsService,
  ) {
    this.logger = loggerService.forContext('GlobalExceptionFilter');
    this.isProduction = configService.get('NODE_ENV') === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = this.cls.isActive() ? this.cls.get('requestId') : undefined;

    const { status, message, errorLabel } = this.resolveException(exception);

    this.log(exception, status, request.url, requestId);

    response.status(status).json({
      statusCode: status,
      error: errorLabel,
      message: this.sanitizeMessage(exception, status, message),
      requestId,
      timestamp: DateUtil.now().toISOString(),
      path: request.url,
    });
  }

  private resolveException(exception: unknown): {
    status: number;
    message: string;
    errorLabel: string;
  } {
    // 1. NestJS HttpException (thrown directly — current pragmatic pattern)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'string' ? res : (res as any).message ?? exception.message;
      return {
        status,
        message: Array.isArray(message) ? message.join('; ') : message,
        errorLabel: HttpStatus[status]?.replace(/_/g, ' ') ?? 'Error',
      };
    }

    // 2. Domain exception (target pattern — mapped via registry)
    if (exception instanceof DomainException) {
      const status =
        DOMAIN_EXCEPTION_HTTP_MAP[exception.name] ?? HttpStatus.INTERNAL_SERVER_ERROR;
      return {
        status,
        message: exception.message,
        errorLabel: HttpStatus[status]?.replace(/_/g, ' ') ?? 'Error',
      };
    }

    // 3. Unexpected error — always 500
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      errorLabel: 'Internal Server Error',
    };
  }

  private sanitizeMessage(
    exception: unknown,
    status: number,
    resolvedMessage: string,
  ): string {
    // In production, never expose internal detail for 5xx errors
    if (this.isProduction && status >= 500) {
      return 'An unexpected error occurred';
    }
    return resolvedMessage;
  }

  private log(
    exception: unknown,
    status: number,
    path: string,
    requestId: string | undefined,
  ) {
    const meta = { path, requestId, statusCode: status };

    if (status >= 500) {
      // Unexpected — log full error object (write() in LoggerService handles Error serialization)
      this.logger.error(exception instanceof Error ? exception : new Error(String(exception)), meta);
    } else if (status >= 400) {
      // Expected HTTP/domain error — log at warn, message only (no stack trace needed)
      const message = exception instanceof Error ? exception.message : String(exception);
      this.logger.warn(`${status} response: ${message}`, meta);
    }
    // No logging for 2xx/3xx — shouldn't reach the filter for those
  }
}
```

**Key design decisions in this implementation:**

- **Handles both patterns** — `HttpException` instances (current pragmatic pattern) and
  `DomainException` instances (target pattern) are both resolved correctly. This means the
  filter is the right place to put this dual-path logic; it should never appear in services.
- **Class-validator errors** — when `ValidationPipe` rejects a request, it throws a
  `BadRequestException` with the error array as the response body's `message` field. The
  `Array.isArray(message) ? message.join('; ')` handles joining those into a single string
  for the standard response shape.
- **Logging severity by status code** — 5xx logs include the full `Error` object (stack trace
  via `LoggerService.write()`'s `Error` handling), while 4xx logs at `warn` with just the
  message, since 4xx errors are expected client mistakes, not application bugs.
- **`sanitizeMessage` is separate** — deliberately isolated so it's easy to test the
  production-sanitization behaviour independently from the rest of the filter logic.

---

## 4. Log Level Decision Guide

This is the most commonly debated question in error handling — "should this `catch` log at
`warn` or `error`?" The rule:

| Condition | Level | Rationale |
|---|---|---|
| Expected business rule violation (profile conflict, not found) | `warn` | Not a bug — expected operational noise, should not trigger alerting |
| Unexpected error propagated from `catch` before rethrowing | Do not log here | `GlobalExceptionFilter` will log it at `error` when it catches the rethrow |
| Unrecoverable Prisma error (connection failure, schema mismatch) | `error` via filter | `PrismaExceptionFilter` logs unmapped Prisma codes at `error` |
| External API call failure after exhausting retries | `error` in the service | Service owns the retry logic, filter won't know it was retried |
| External API call failure on a retried attempt | `warn` in the service | Not yet terminal — noting degraded state without raising an alert |

The cleaner the application code gets (approaching the target domain-exception pattern), the
fewer explicit `catch`-and-log blocks are needed in services at all — the filter pair becomes
the single place where logging of exceptions happens, keeping logging logic out of business code.

---

## 5. Handling `ValidationPipe` Errors

`ValidationPipe` (from `class-validator`) throws `BadRequestException` with a body containing
an array of validation error messages. The `GlobalExceptionFilter`'s `HttpException` branch
handles this automatically — but for API responses, the `message` field will be a joined
string like `"email must be an email; password is too short"`.

If your API contract requires validation errors to be an array (e.g., for form-level display),
adjust the `resolveException` method to preserve the array under a `details` key while keeping
`message` as a summary string:

```typescript
// Enhanced response shape for validation errors
if (exception instanceof BadRequestException) {
  const res = exception.getResponse() as any;
  if (Array.isArray(res.message)) {
    return {
      status: HttpStatus.BAD_REQUEST,
      message: 'Validation failed',
      errorLabel: 'Bad Request',
      details: res.message,   // add to the standard error response shape
    };
  }
}
```
If you add `details`, add it to the `ErrorResponseDto` Swagger schema too (per
`api-design-expert`'s `ErrorResponseDto` documentation section) — the response shape contract
must be consistent between what the filter produces and what the Swagger docs describe.

---

## 6. Testing Exception Filters

Every exception filter needs its own unit test suite. The filter is a standalone class — it
doesn't need a full NestJS module, just mocked `ArgumentsHost`, `LoggerService`, and
`ConfigService`.

```typescript
// core/filters/global-exception.filter.spec.ts
describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock };
  let loggerServiceMock: jest.Mocked<LoggerService>;

  beforeEach(() => {
    mockResponse = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(), log: jest.fn(),
      }),
    } as unknown as jest.Mocked<LoggerService>;

    filter = new GlobalExceptionFilter(
      loggerServiceMock,
      { get: jest.fn().mockReturnValue('test') } as any,   // NODE_ENV = 'test'
      { isActive: jest.fn().mockReturnValue(true), get: jest.fn().mockReturnValue('req-id') } as any,
    );
  });

  // Arrange/Act/Assert structure per test-automation-expert conventions
  describe('HttpException', () => {
    it('should return correct status and shape for NotFoundException', () => {
      // Arrange
      const exception = new NotFoundException('User not found');
      const host = mockArgumentsHost(mockResponse);

      // Act
      filter.catch(exception, host);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 404,
        error: 'Not Found',
        message: 'User not found',
        requestId: 'req-id',
      }));
      expect(loggerServiceMock.forContext('GlobalExceptionFilter').warn).toHaveBeenCalled();
    });
  });

  describe('DomainException', () => {
    it('should map ProfileAlreadyExistsException to 409', () => {
      const exception = new ProfileAlreadyExistsException('user-123');
      const host = mockArgumentsHost(mockResponse);

      filter.catch(exception, host);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
    });
  });

  describe('Unexpected error', () => {
    it('should return 500 and log at error level', () => {
      const exception = new Error('Something exploded');
      const host = mockArgumentsHost(mockResponse);

      filter.catch(exception, host);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(loggerServiceMock.forContext('GlobalExceptionFilter').error).toHaveBeenCalledWith(
        exception,
        expect.objectContaining({ statusCode: 500, requestId: 'req-id' }),
      );
    });

    it('should sanitize message in production', () => {
      // Arrange — production filter instance
      const prodFilter = new GlobalExceptionFilter(
        loggerServiceMock,
        { get: jest.fn().mockReturnValue('production') } as any,
        { isActive: jest.fn().mockReturnValue(true), get: jest.fn().mockReturnValue('req-id') } as any,
      );

      // Act
      prodFilter.catch(new Error('Internal detail'), mockArgumentsHost(mockResponse));

      // Assert — client message is sanitized
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'An unexpected error occurred',
      }));
    });
  });
});

// Helper — mirrors what NestJS provides as ArgumentsHost
function mockArgumentsHost(response: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url: '/test-path' }),
    }),
  } as unknown as ArgumentsHost;
}
```
