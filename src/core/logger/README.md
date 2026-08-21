# `core/logger` — Logging Contract

This folder owns **all logging infrastructure** for the application. No service imports `pino`
directly or uses `console.*` — everything flows through `LoggerService`.

---

## Log Schema

Every structured log line emitted in GCP mode contains:

```jsonc
{
  "severity": "INFO", // Cloud Logging severity enum
  "message": "Like created successfully", // human-readable summary
  "context": "LikesService", // from forContext()
  "requestId": "01HZ...", // auto-injected from CLS
  "logging.googleapis.com/trace": "projects/...", // auto-injected from CLS (when Cloud Trace enabled)
  "timestamp": "2026-07-03T04:00:00.000Z",
  "serviceContext": {
    // enables GCP Error Reporting aggregation
    "service": "breathaway-api",
    "version": "1.2.0",
  },
  // ...entity IDs from the meta payload (e.g. userId, likeId, matchId)
}
```

### Cloud Logging severity mapping

Pino labels map to Cloud Logging `LogSeverity` via the **explicit lookup table** in
`gcp-logger.config.ts`. Do **not** use `label.toUpperCase()` — Pino's `warn` uppercases to
`WARN`, which Cloud Logging silently falls back to `DEFAULT` severity, breaking
severity-based alerting.

| Pino level | Cloud Logging severity |
| ---------- | ---------------------- |
| `trace`    | `DEFAULT`              |
| `debug`    | `DEBUG`                |
| `info`     | `INFO`                 |
| `warn`     | `WARNING`              |
| `error`    | `ERROR`                |
| `fatal`    | `CRITICAL`             |

---

## Usage

### 1. Get a contextual logger

Every class that logs must call `forContext()` in its constructor:

```ts
// Direct:
private readonly logger = this.loggerService.forContext(MyService.name);

// Via BaseService (preferred — already handles this):
class MyService extends BaseService {
  constructor(logger: LoggerService, ...) { super(logger); }
  // this.logger is now forContext('MyService')
}
```

### 2. The 3-line rule per method

```ts
async createWidget(userId: string, dto: CreateWidgetDto) {
  // 1. Debug on entry — always. Free in prod (gated by LOG_LEVEL), available in staging.
  this.logger.debug('Creating widget', { userId });

  // 2. Warn before ANY throw — with all entity IDs in scope at throw-site.
  //    The global filter catches the exception, but by then local context is gone.
  if (!canCreate) {
    this.logger.warn('Widget creation failed: quota exceeded', { userId, currentCount });
    throw new QuotaExceededException();
  }

  const widget = await this.prisma.widget.create({ ... });

  // 3. Log (info) on every successful write (Create / Update / Delete).
  //    Reads do NOT get an info log — Cloud Run platform logs already record them.
  this.logger.log('Widget created successfully', { widgetId: widget.id, userId });
  return widget;
}
```

### 3. Log levels at a glance

| Level   | Method              | When                                                            |
| ------- | ------------------- | --------------------------------------------------------------- |
| `debug` | `logger.debug(...)` | Method entry; intermediate state in complex flows               |
| `info`  | `logger.log(...)`   | Every successful **write** (Create / Update / Delete)           |
| `warn`  | `logger.warn(...)`  | Before every `throw new DomainException()`; retried calls       |
| `error` | `logger.error(...)` | `catch` blocks that rethrow; unexpected infrastructure failures |

**Do NOT log `info` on reads** — Cloud Run's request logs cover HTTP-level tracking.
Application `info` is reserved for business events (user created, payment processed, match formed).

---

## CLS-based `requestId` and `traceContext` injection

`requestId` and `logging.googleapis.com/trace` are **automatically injected** into every log
call via the `write()` method reading from `nestjs-cls`. Call sites do **not** pass `requestId` manually.

For **async boundaries** (Pub/Sub consumers, scheduled jobs, event emitter listeners) that run
outside the HTTP lifecycle, create a synthetic CLS context:

```ts
await this.cls.run(async () => {
  this.cls.set('requestId', ulid());
  await this.doBackgroundWork();
});
```

---

## PII Prohibition (CRITICAL)

**Never log:** names, emails, raw phone numbers, OTP values, auth tokens, passwords, push tokens.

**Safe to log:** UUIDs/ULIDs (`userId`, `likeId`, `matchId`), hashed values, status enums,
numeric amounts, error codes, exception class names.

---

## Extractability constraint

This folder imports **only** from `nestjs-cls`, `pino`, `@nestjs/common`, and `@nestjs/config`.
Zero imports from domain modules or service-specific types. This constraint keeps the folder
extractable to a monorepo workspace lib or npm package when a second service is added —
a `git mv`, not a refactor.
