# Pino Logging — Setup, Levels, Structure, Redaction

Reference for this project's actual `LoggerService` (plain `pino`, hand-wrapped — **not**
`nestjs-pino`) and `createGcpLoggerConfig`, producing logs Cloud Logging and Cloud Error
Reporting parse correctly.

> This file documents the implementation that exists in this codebase
> (`core/logger/logger.service.ts` + `core/logger/gcp-logger.config.ts`) as the standard to
> replicate and extend — it is not a generic Pino tutorial. If you're setting up logging for a
> new service in this monorepo/org, copy this pattern, don't reach for `nestjs-pino`.

---

## 1. Why Plain Pino, Not `nestjs-pino`

This project wraps `pino` directly inside a standard NestJS singleton provider
(`LoggerService implements NestLoggerService`), rather than using `nestjs-pino`'s
request-scoped `PinoLogger` + `pino-http` middleware combo.

**Why this is the right call here:**
- Avoids `nestjs-pino`'s request-scope-vs-singleton-injection complexity entirely — services,
  use cases, and repositories across this project are singleton-scoped (per
  `clean-architecture-expert`'s DI conventions), and a singleton `LoggerService` matches that
  without any scope-mismatch risk.
- `forContext(context)` returns an isolated child logger (`baseLogger.child({ context })`) per
  call site, giving the same per-class log attribution as `nestjs-pino`'s context binding,
  without coupling logging to the HTTP request lifecycle via middleware.
- Implementing `NestLoggerService` means this same instance can be wired in as Nest's global
  logger (`app.useLogger(app.get(LoggerService))`), so framework-internal logs (bootstrap,
  lifecycle hooks) flow through the same structured pipeline as application logs.

Do not introduce `nestjs-pino` alongside this — it would create two parallel logging
mechanisms with different context-binding models. Extend the existing `LoggerService` instead.

---

## 2. Environment-Aware Configuration

```typescript
// core/logger/logger.service.ts
const isProduction = configService.get<string>('NODE_ENV') === 'production';
const isGcp = configService.get<string>('DEPLOYMENT_ENV') === 'gcp';
const logLevel = configService.get<string>('LOG_LEVEL') || 'info';
```

Two independent flags, not one:
- `isProduction` controls whether `pino-pretty` transport is used (readability for local/dev).
- `isGcp` controls whether the GCP-specific structured config (`createGcpLoggerConfig`) is used
  at all — this matters because **non-GCP environments** (e.g., local Docker Compose, a future
  non-GCP deploy target) shouldn't be forced into GCP's `severity`/`serviceContext` shape.

```typescript
if (isGcp) {
  this.baseLogger = pino.default(createGcpLoggerConfig(logLevel, appName, appVersion));
} else {
  this.baseLogger = pino.default({
    level: logLevel,
    transport: isProduction ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label.toUpperCase() }) },
  });
}
```

**Rule:** Never enable `pino-pretty` when `isGcp` is true, regardless of `NODE_ENV` — pretty
output breaks Cloud Logging's structured JSON parsing. The current code achieves this
correctly since `createGcpLoggerConfig` never wires in a `transport` option at all; if anyone
ever adds one, that's a regression to flag immediately in review.

### `LOG_LEVEL` validation
```typescript
const validLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
if (!validLevels.includes(logLevel)) {
  throw new Error(`Invalid LOG_LEVEL: ${logLevel}`);
}
```
Fail fast at startup on a misconfigured `LOG_LEVEL` env var, rather than silently falling back
to a default and masking a deployment config mistake — keep this validation when extending the
service.

---

## 3. GCP Structured Config — `createGcpLoggerConfig`

```typescript
// core/logger/gcp-logger.config.ts
export const createGcpLoggerConfig = (
  logLevel: string,
  appName: string,
  appVersion: string,
): pino.LoggerOptions => ({
  level: logLevel,
  formatters: {
    level: (label: string) => ({ severity: PINO_LEVEL_TO_CLOUD_SEVERITY[label] ?? 'DEFAULT' }),
    bindings: (bindings) => ({
      ...bindings,
      serviceContext: { service: appName, version: appVersion },
    }),
  },
  messageKey: 'message',
  timestamp: () => `,"timestamp":"${DateUtil.now().toISOString()}"`,
  serializers: {
    error: pino.stdSerializers.err,
    req: gcpRequestSerializer,
    res: gcpResponseSerializer,
  },
  base: {
    serviceContext: { service: appName, version: appVersion },
  },
});
```

### Severity mapping — use an explicit lookup, never `label.toUpperCase()` alone

Cloud Logging's `LogSeverity` enum expects specific strings. Pino's level labels don't match
it 1:1 — `.toUpperCase()` alone produces `WARN` and `FATAL`, but Cloud Logging expects
`WARNING` and `CRITICAL`. A mismatched string isn't rejected, it's silently treated as
`DEFAULT` severity, which breaks severity-based filtering and alerting in the GCP console
without throwing any error — this is the kind of bug that's invisible locally and only
noticed when someone asks "why didn't the alert fire" weeks later. Always map explicitly:

```typescript
// core/logger/gcp-severity.util.ts
const PINO_LEVEL_TO_CLOUD_SEVERITY: Record<string, string> = {
  trace: 'DEBUG',     // Cloud Logging has no TRACE severity; fold into DEBUG
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',    // not "WARN"
  error: 'ERROR',
  fatal: 'CRITICAL',  // not "FATAL"
};
```

Use this map in `formatters.level`, never `label.toUpperCase()`, in this or any future GCP
logger config in this codebase.

### `serviceContext` — Cloud Error Reporting integration

The `bindings` formatter and top-level `base` both attach `serviceContext: { service, version }`
to every log line. This isn't just metadata — `serviceContext` with `service`/`version` fields
is part of the payload shape **Cloud Error Reporting** looks for to automatically detect,
group, and surface application errors (distinct from raw Cloud Logging log volume). Combined
with `error: pino.stdSerializers.err` producing a proper `message`/`stack`/`name` structure on
error-level logs, this means `error`-level logs in this project are Error-Reporting-eligible
by default, with no separate Sentry/Error Reporting SDK integration required.

**Rule:** Don't remove or simplify `serviceContext`/the `error` serializer when refactoring this
config — doing so silently disables automatic error aggregation in the GCP console, even though
logs would still appear correctly in Cloud Logging.

### `messageKey: 'message'`
Cloud Logging's Logs Explorer surfaces a field named `message` as the primary display line.
Pino's default key is `msg`. This remap is required — do not omit it when extending the config.

### Timestamp — `DateUtil.now()`, not raw `Date`
```typescript
timestamp: () => `,"timestamp":"${DateUtil.now().toISOString()}"`,
```
Consistent with this project's date-handling convention (see `test-automation-expert`'s
`DateUtil` rule) — use `DateUtil`, never `new Date()` directly, anywhere a timestamp is
generated, including logger config.

---

## 4. Request/Response Serializers — Redaction Interaction

```typescript
serializers: {
  req: (req) => ({
    method: req.method,
    url: req.url,
    headers: req.headers,
    remoteAddress: req.remoteAddress,
    remotePort: req.remotePort,
  }),
  res: (res) => ({ statusCode: res.statusCode, headers: res.headers }),
},
```

**This serializer currently passes `headers` through wholesale, including `Authorization` and
`Cookie`.** If Pino's `redact` option is configured with paths like `req.headers.authorization`,
verify the redaction actually fires correctly: Pino's `redact` paths match against the
**serialized output shape**, evaluated after serializers run. Since this serializer passes
`req.headers` straight through unchanged, a redact path of `req.headers.authorization` should
still match correctly — confirm this with an explicit test log line before relying on it, since
serializer + redact interaction is a common source of "I thought this was redacted" surprises.

**Stronger, more explicit alternative** — redact within the serializer itself, so there's no
dependency on `redact` path matching against post-serialization shape at all:

```typescript
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api-key'];

function gcpRequestSerializer(req: {
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  remoteAddress?: string;
  remotePort?: number;
}) {
  const headers = { ...req.headers };
  for (const key of SENSITIVE_HEADERS) {
    if (key in headers) headers[key] = '[REDACTED]';
  }
  return {
    method: req.method,
    url: req.url,
    headers,
    remoteAddress: req.remoteAddress,
    remotePort: req.remotePort,
  };
}
```
Recommended: adopt this serializer-level redaction as the primary mechanism for request
headers specifically (since this serializer already controls that exact shape), and keep
Pino's top-level `redact` option for everything else (body fields, nested DTO fields spread
into log metadata — see section 7) where there's no custom serializer already in the path.

---

## 5. `forContext()` — Context-Scoped Child Loggers

```typescript
forContext(context: string): ContextualLogger {
  const childLogger = this.baseLogger.child({ context });
  return {
    debug: (message, meta) => this.write(childLogger, 'debug', message, meta),
    info:  (message, meta) => this.write(childLogger, 'info', message, meta),
    warn:  (message, meta) => this.write(childLogger, 'warn', message, meta),
    error: (message, meta) => this.write(childLogger, 'error', message, meta),
    log:   (message, meta) => this.write(childLogger, 'info', message, meta),
  };
}
```

- `.child({ context })` creates a genuinely isolated Pino child logger, not a wrapper closure —
  this is real Pino child-logger behaviour, with negligible overhead per call.
- `context` should always be the calling class name as a string literal (`'ProfilesService'`),
  matching exactly what's asserted in this project's test mocks (per `test-automation-expert`).
- `log()` is an alias for `info()`, preserved for compatibility with NestJS's built-in
  `LoggerService` interface shape (`log` is the method Nest's internals call by default) —
  don't remove this alias even though application code should prefer calling `.info()` directly
  for clarity.

### The unified `write()` method handles polymorphic message types
```typescript
private write(logger, level, message: unknown, meta?: Record<string, unknown>) {
  if (typeof message === 'string') {
    hasMeta ? logger[level](meta, message) : logger[level](message);
  } else if (message instanceof Error) {
    logger[level]({ ...meta, error: { message: message.message, stack: message.stack, name: message.name } }, message.message);
  } else if (typeof message === 'object' && message !== null) {
    logger[level]({ ...message, ...meta });
  } else {
    hasMeta ? logger[level](meta, String(message)) : logger[level](String(message));
  }
}
```
This means callers can pass an `Error` directly as the first argument and get a correctly
structured `error` field automatically — prefer this over manually destructuring
`error.message`/`error.stack` at call sites:

```typescript
// ✅ Preferred — Error passed directly, write() structures it correctly
this.logger.forContext('ProfilesService').error(dbError, { userId });

// ❌ Avoid — loses stack trace structure, duplicates what write() already does
this.logger.forContext('ProfilesService').error(`Failed: ${dbError.message}`, { userId });
```

> Note: this differs from the convention shown in the earlier draft of this skill (which
> assumed an `error(message, error, meta)` three-argument signature). This project's actual
> signature is `error(message: unknown, meta?: Record<string, unknown>)`, where `message` can
> itself *be* the `Error` object. Use the actual two-argument signature everywhere — do not
> introduce a three-argument `error()` call to match a different convention.

---

## 6. Log Level Policy

| Level | Production default | Use for |
|---|---|---|
| `error` | always on | Unhandled exceptions, exhausted retries, data integrity violations |
| `warn` | always on | Handled-but-notable: validation rejection patterns, retried calls, degraded fallback paths |
| `info` | always on | Business events: created/updated/deleted resources, auth events, job completions |
| `debug` | **off** by default | Detailed flow tracing — enable via `LOG_LEVEL=debug` for diagnosis |
| `trace` | off | Rarely needed; maps to `DEBUG` severity in Cloud Logging (see section 3) |

Set via the `LOG_LEVEL` env var, validated at startup (section 2) — never hardcoded, never
changed by editing source for a one-off production diagnosis session.

**Rule:** Never log at `info` for every incoming request. Cloud Run's own request logs already
capture method/path/status/latency automatically. Application-level `info` logs exist to record
*why* something happened in business terms, not to duplicate infrastructure logging.

---

## 7. What to Include in Log Metadata

```typescript
// ✅ Structured — queryable as jsonPayload.orderId in Cloud Logging
this.logger.forContext('OrdersService').info('Order created', { orderId, userId, total: order.total });

// ❌ Unstructured — can't be filtered/queried by field
this.logger.forContext('OrdersService').info(`Order ${orderId} created for user ${userId}`);
```

Always include the relevant resource ID(s) in `meta`. Never spread an entire DTO or request
body into `meta` without an explicit allowlist of safe fields — it's easy to accidentally
include a password or token field added later by someone who didn't know to update a redaction
list. Prefer naming specific fields over `{ ...dto }`.

---

## 8. Redaction Beyond Headers

For fields outside the `req`/`res` serializer's control (body fields, nested objects spread
into `meta`), configure Pino's top-level `redact` option:

```typescript
redact: {
  paths: [
    'req.headers.authorization',   // also covered by serializer redaction, section 4 — defense in depth
    'req.headers.cookie',
    '*.password',
    '*.passwordHash',
    '*.token',
    '*.idToken',
    '*.refreshToken',
    '*.secret',
    '*.firebaseServiceAccountJson',
  ],
  censor: '[REDACTED]',
},
```
Audit this list whenever a new sensitive field type is introduced anywhere in the schema (new
auth provider, new payment field, new PII field) — cross-reference `security-reviewer`'s
secrets-management section, since this is the same discipline applied to logs specifically.

---

## 9. Wiring as NestJS's Global Logger

Since `LoggerService implements NestLoggerService`, wire it in during bootstrap so
framework-internal logs (module initialization, lifecycle hooks) also flow through the
structured GCP pipeline instead of Nest's default console logger:

```typescript
// main.ts
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(LoggerService));
```
`bufferLogs: true` ensures logs emitted before `useLogger` is called (very early bootstrap) are
buffered and flushed once the real logger is attached, rather than lost or printed via Nest's
default logger.

---

## 10. Testing Considerations

No change needed to this project's existing test mocking pattern
(`LoggerService.forContext(...)` returning `{ log, error, warn, debug, info }` jest mocks, per
`test-automation-expert`'s `mocking-strategy.md`) — this file documents the production
implementation those mocks stand in for. The two-argument `error(message, meta)` signature
(where `message` may be an `Error`) is compatible with the existing mock shape; no test
file changes are required as a result of this reference update.
