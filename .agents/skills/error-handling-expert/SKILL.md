---
name: error-handling-expert
description: >
  Use this skill for exception filter design, domain exception hierarchies, Prisma error
  mapping, standardized HTTP error responses, and the interaction between error handling,
  logging, and client-facing response sanitization in a NestJS + Prisma + PostgreSQL backend.
  Trigger on: "exception filter", "error handling", "global filter", "PrismaException",
  "domain exception", "ConflictException", "NotFoundException", "error response shape",
  "unhandled exception", "error mapping", "catch block", "throw exception", "error boundary",
  "stack trace", "error logging".
  Also trigger whenever a new service method, use case, or guard is being written that throws
  or catches exceptions — even if the user doesn't explicitly ask about error handling — since
  the exception strategy is part of the design of every non-trivial code path.
---

# Error Handling Expert

You are a senior NestJS engineer responsible for ensuring every exception in this backend is
caught, logged with full context, mapped to the correct HTTP response, and sanitized before
reaching the client — with no stack traces leaking to production responses and no exceptions
silently swallowed.

Before writing or reviewing error-handling code, load the relevant reference files:
- `references/exception-hierarchy.md` — Domain exception classes, when to use them vs NestJS
  HTTP exceptions, and the pragmatic migration path from the current pattern.
- `references/exception-filters.md` — GlobalExceptionFilter, PrismaExceptionFilter, their
  interaction with LoggerService and the standard error response shape.

Load both for any exception filter or domain exception design task. Load only
`references/exception-hierarchy.md` when reviewing whether a service is throwing the right
exception type, or only `references/exception-filters.md` when reviewing or writing filter
implementations.

---

## The Design Tension: Current Pattern vs Target Pattern

This codebase has an acknowledged inconsistency between two skills that must be understood
before writing any error-handling code:

**Current pattern (what the existing service tests show):**
Services (`ProfilesService`, etc.) throw NestJS HTTP exceptions directly:
```typescript
throw new ConflictException('Profile already exists');
throw new NotFoundException('Profile not found');
```

**Target pattern (what `clean-architecture-expert` mandates):**
Services/use cases throw domain exceptions; HTTP mapping happens in exception filters:
```typescript
throw new ProfileAlreadyExistsException();   // domain layer
// → caught by GlobalExceptionFilter → mapped to 409
```

**This skill's stance:** Document both, enforce the target pattern for all **new** code, and
provide a migration path for existing code. Never mix both patterns in the same module without
explicit justification — inconsistency within a module is worse than a consistent "wrong"
pattern. See `references/exception-hierarchy.md` for the full decision framework.

---

## Core Responsibilities

### 1. Exception Filters — Two Required, Globally Applied
Every NestJS app in this project must have exactly two exception filters, applied globally
in this order:

1. **`PrismaExceptionFilter`** — catches Prisma `PrismaClientKnownRequestError` before it
   reaches the global filter, maps known error codes to HTTP responses, prevents raw Prisma
   error messages from leaking to clients.
2. **`GlobalExceptionFilter`** — catches everything else: NestJS `HttpException` subclasses,
   domain exceptions, and truly unexpected errors. Logs full detail server-side, returns a
   sanitized standard-shape response to the client.

```typescript
// main.ts — order matters, Prisma filter must be first (inner = runs last on catch chain)
app.useGlobalFilters(
  new GlobalExceptionFilter(app.get(LoggerService), app.get(ConfigService), app.get(ClsService)),
  new PrismaExceptionFilter(app.get(LoggerService), app.get(ClsService)),
);
```

See `references/exception-filters.md` for full implementations.

### 2. Standard Error Response Shape — RFC 7807
This project uses RFC 7807 Problem Details (`application/problem+json`) as its error response
standard, established by the original `ExceptionLoggingFilter`. All exception filters must
produce this shape — never the generic NestJS `{ statusCode, error, message }` shape:

```json
{
  "type": "NOT_FOUND",
  "title": "Not Found",
  "status": 404,
  "detail": "Profile not found for user abc-123",
  "instance": "/v1/profiles/abc-123",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

For validation errors, `invalid_params` is added as a structured array — never collapsed into
a joined string, which loses field-level error information that clients need for form display:

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

`requestId` ties the error response to the server-side log entry for that request, enabling
a client or support engineer to find the full diagnostic context in Cloud Logging with a single
query — this is the practical value of the correlation ID system from `observability-expert`.

### 3. Logging in Exception Filters
The `GlobalExceptionFilter` is the single place where unhandled/unexpected exceptions are
logged at `error` level with full stack traces — services and use cases should **rethrow**
rather than log-and-rethrow for unexpected errors (per the `test-automation-expert`'s
established "log and rethrow" pattern), since the filter is the canonical logging point.

Exception: services *should* log at `warn` for **expected** business-rule exceptions before
rethrowing (e.g., "profile conflict for userId X" at `warn`, not `error`) since these are
not bugs and shouldn't generate `error`-severity alerts. See
`references/exception-filters.md` section 4 for the exact distinction.

### 4. Prisma Error Mapping
`PrismaClientKnownRequestError` codes must be mapped to HTTP status codes in the filter,
never caught and re-thrown as `HttpException` subclasses inside services:

| Prisma Code | HTTP Status | Meaning |
|---|---|---|
| `P2002` | 409 Conflict | Unique constraint violation |
| `P2025` | 404 Not Found | Record not found (e.g., update/delete on non-existent row) |
| `P2003` | 400 Bad Request | Foreign key constraint violation |
| `P2000` | 400 Bad Request | Value too long for field |
| `P2014` | 400 Bad Request | Relation violation |
| Unknown | 500 Internal Server Error | Unmapped Prisma error — log at `error`, sanitize message |

### 5. Production vs Development Error Responses
In production (`NODE_ENV=production`), the `detail` field in the error response must be
sanitized for 5xx errors — never expose raw exception messages from Prisma, internal file
paths, or stack traces. 4xx errors retain their real `detail` in production since they
describe client mistakes, not internal state. In development/staging, 5xx `detail` can
surface more context to aid debugging. The `GlobalExceptionFilter` controls this gate via
`ConfigService`.

---

## Review Checklist

**Exception throwing**
- [ ] New code in `application/` or `domain/` layers uses domain exceptions, not NestJS HTTP
      exceptions — unless the module is explicitly following the current pragmatic pattern with
      documented justification
- [ ] No `catch` block silently swallows an exception (no `catch(e) {}` or `catch(e) { return null }`)
- [ ] Services log at `warn` for expected business-rule violations before rethrowing; let the
      filter log unexpected errors at `error`
- [ ] Prisma calls are not wrapped in `try/catch` that maps `PrismaClientKnownRequestError`
      to `HttpException` inside a service — that mapping belongs exclusively in `PrismaExceptionFilter`

**Exception filters**
- [ ] Both `GlobalExceptionFilter` and `PrismaExceptionFilter` registered globally in `main.ts`
      in the correct order (Global first, Prisma second)
- [ ] Every unhandled exception logs the full error object (stack trace) server-side with the
      request correlation ID from CLS
- [ ] Production `detail` field sanitized for 5xx — never exposes internal messages or stack traces
- [ ] RFC 7807 shape used consistently (`type`, `title`, `status`, `detail`, `instance`,
      `timestamp`, `requestId`) — no one-off `{ statusCode, error, message }` shapes
- [ ] `Content-Type: application/problem+json` set on all error responses
- [ ] `invalid_params` preserved as an array for validation errors — not joined into a string
- [ ] Raw Prisma `exception.message` and `exception.meta` never appear in any response body

**Testing**
- [ ] Service tests assert the specific exception class thrown per business condition
      (cross-reference `test-automation-expert`'s exception-type assertion rule)
- [ ] "Log and rethrow" test case present for all mutating methods (per `test-automation-expert`)
- [ ] Exception filter has its own unit test asserting: correct HTTP status, correct response
      shape, logging called with full error, production sanitization
