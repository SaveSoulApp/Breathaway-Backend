---
name: observability-expert
description: >
  Use this skill for logging, tracing, metrics, and monitoring/alerting in a NestJS + Prisma +
  PostgreSQL backend on GCP Cloud Run, using this project's hand-wrapped plain-Pino
  LoggerService (core/logger/) and Cloud Logging/Cloud Trace/Cloud Monitoring for observability
  infrastructure.
  Trigger on: "add logging", "structured logs", "Cloud Logging", "Cloud Trace", "tracing",
  "correlation id", "request id", "log level", "Cloud Monitoring", "alerting policy",
  "uptime check", "SLO", "error tracking", "Sentry", "dashboard", "metrics", "log a Prisma
  error", "debug production issue", "logger context", "step logging", "milestone logging",
  "audit trail", "log pattern", "serializeError".
  Also trigger whenever a new service, controller, guard, or exception filter is being written
  or reviewed — even if the user doesn't explicitly ask about logging — since every code path
  that can fail needs to be observable, not just functional.
---

# Observability Expert

You are an SRE/observability engineer ensuring this NestJS backend produces structured,
correlated, actionable logs and metrics that make production issues diagnosable from Cloud
Logging and Cloud Monitoring alone — without needing to reproduce locally.

Before writing or reviewing logging/monitoring code, load the relevant reference files:
- `references/pino-logging.md` — This project's actual LoggerService/GCP config, log levels, structured fields, redaction, `serializeError`.
- `references/tracing-correlation.md` — Request IDs, Cloud Trace correlation, propagation across async boundaries, `requestStart` in CLS.
- `references/service-logging-patterns.md` — **The primary reference for writing logs inside service methods.** `ctx` pattern, `step` field, level decision table, full create-method template, log-and-rethrow for infrastructure calls, layer responsibility breakdown.
- `references/monitoring-alerting.md` — Cloud Monitoring dashboards, alerting policies, uptime checks, SLOs.

Load all four for a full observability review of a service or module. Load the relevant one
for a narrowly scoped task (e.g., "just fix the log levels in this service").

---

## Core Responsibilities

### 1. Structured Logging (Plain Pino, hand-wrapped — not nestjs-pino)
- All logs are structured JSON (Pino's default), never `console.log` string concatenation —
  Cloud Logging parses structured JSON fields directly into queryable log attributes.
- Severity must be mapped via an **explicit lookup table**, not `label.toUpperCase()` — Pino's
  `warn`/`fatal` labels uppercase to `WARN`/`FATAL`, but Cloud Logging's `LogSeverity` enum
  expects `WARNING`/`CRITICAL`. A mismatch isn't rejected, it silently falls back to `DEFAULT`
  severity, breaking severity-based filtering and alerting without any visible error. See
  `references/pino-logging.md` section 3 for the required map.
- Logger context follows this project's established `LoggerService.forContext('ServiceName')`
  pattern — every log line carries its originating class/context, not an anonymous global logger.
- `error`-level logs carry a `serviceContext` field (service name + version), making them
  automatically eligible for Cloud Error Reporting's aggregation — don't strip this field when
  touching the logger config.
- See `references/pino-logging.md` for this project's actual `LoggerService` +
  `createGcpLoggerConfig` implementation, log level policy, and what must never be logged
  (secrets, full tokens, full request bodies with PII).

### 2. Request Correlation & Tracing
- Every request gets a correlation/request ID, propagated through to every log line emitted
  while handling that request — so a single Cloud Logging query by request ID reconstructs the
  full request lifecycle across services and async boundaries.
- `requestStart` is stored in CLS by the `ClsModule` middleware setup
  (`cls.set('requestStart', Date.now())`) so the `GlobalExceptionFilter` can compute accurate
  `latencyMs` on error paths, independent of the interceptor.
- Cloud Run automatically populates `X-Cloud-Trace-Context` *if Cloud Trace is enabled on the
  project* (verify, don't assume); capture and attach to every structured log.
- See `references/tracing-correlation.md` for the full CLS-based propagation setup.

### 3. Step-Level Milestone Logging in Services

This is the primary pattern for service methods. Every service method must produce a
structured audit trail that answers: **who, what, which step, what was the outcome**.

The four rules — see `references/service-logging-patterns.md` for full templates and examples:

1. **`ctx` object first:** Build `const ctx = { userId, entityId, ... }` as the first line of
   every service method and spread it into every log call. Never inline fields ad hoc per call.

2. **`step` field on every log:** Every log call carries `step: 'snake_case_name'` as a
   structured field. This is queryable in Cloud Logging as `jsonPayload.step="duplicate_check"`
   — far faster for incident reconstruction than text-searching log messages.

3. **Milestone at every boundary crossing:** Log at every external call result (DB write, service
   call, transaction commit), every business rule branch taken or rejected, and method entry/exit.
   Do not log every line; do not log only on errors.

4. **Wrap infrastructure calls with log-and-rethrow:** Domain exception paths (not-found,
   duplicate, self-like) already have explicit `warn` + `throw`. Infrastructure failure paths
   (Prisma transaction, external HTTP call) must be wrapped in try/catch to preserve local
   variable context that the global filter cannot see:
   ```typescript
   try {
     result = await this.prisma.$transaction(async (tx) => { ... });
   } catch (err) {
     this.logger.error('Operation transaction failed', {
       ...ctx, step: 'persist_and_deduct', err: serializeError(err),
     });
     throw err;
   }
   ```

### 4. What Gets Logged, At What Level

| Level | When |
|---|---|
| `log` / `info` | Method entry on write operations, each step success milestone, method exit confirming the business event completed |
| `debug` | Method entry on read-only operations, guards-passed confirmations, which identity-resolution branch was taken, DB read results |
| `warn` | Any expected business rule rejection immediately before throwing a domain exception — captures entity IDs and local state the global filter cannot see |
| `error` | Infrastructure call failure (DB down, external service timeout) in a log-and-rethrow catch block |

- **Read methods** (`findOne`, `findAll`): Entry and result at `debug` only. `warn` on not-found before throwing.
- **Write methods** (`create`, `update`, `delete`): Entry at `log`, guards at `debug`, transaction commit at `log`, exit at `log`.
- **Never log at `info` for every incoming request** — Cloud Run's own request logs already provide method/path/status/latency. Application `info` logs mark business-meaningful events.
- **Every `catch` block that doesn't rethrow** must log at `error` or `warn`. Silently swallowed exceptions are the hardest thing to diagnose in production.

### 5. Error Serialization — `serializeError`

All `catch` blocks must use `serializeError` from `@common/utils/error.utils`:

```typescript
import { serializeError } from '@common/utils/error.utils';

this.logger.error('Transaction failed', {
  ...ctx,
  step: 'persist_and_deduct',
  err: serializeError(err),  // → { message, name, stack, code? }
});
```

Never cast error objects at call sites (`(err as { stack?: string }).stack`). `serializeError`
produces a consistent `{ message, name, stack, code? }` shape across every service, making
Cloud Logging queries and alert conditions field-consistent.

### 6. Layer Responsibility — No Double-Logging

| Layer | Owns | Does NOT log |
|---|---|---|
| **Service** | Domain context: entity IDs, step name, business rule failure reason | HTTP method/path/status |
| **LoggingInterceptor** | Successful request completion: `statusCode`, `latencyMs` at `debug` | Error paths — filter owns those |
| **GlobalExceptionFilter** | Error HTTP outcome: `statusCode`, `latencyMs`, `exceptionType`, error message | Entity IDs (not available at filter level) |

The `LoggingInterceptor` must NOT have an `error` tap. Using `tap({next, error})` produces a log
with a stale `statusCode: 200` (before the filter writes the real status) and duplicates the
filter's log. The filter reads `requestStart` from CLS to compute accurate `latencyMs` on error
paths. See `references/service-logging-patterns.md` section 9 for the full rationale.

The `GlobalExceptionFilter` emits `exceptionType: err.constructor.name` — e.g.
`"AlreadyLikedException"` — on every error log. This is queryable as a structured field and
more useful for audit than counting by HTTP status code, since multiple exception types can map
to the same status.

### 7. PII Redaction (CRITICAL)

- **Never log:** Names, email addresses, phone numbers, plaintext passwords, full auth tokens,
  physical addresses, push notification tokens, free-text user-provided strings (labels, bios).
- **Allowed:** UUIDs/ULIDs, hashed values (`publicValueHash`, `publicValueMasked`), status enums,
  numeric amounts, boolean flags, error codes.
- **Log flags, not values:** If a field contains user-provided text, log a boolean describing
  its presence/absence instead:
  ```typescript
  // ✅
  this.logger.log('Label updated', { likeId, userId, labelCleared: dto.label === null });
  // ❌ — "Sarah from the gym" is PII
  this.logger.log('Label updated', { likeId, userId, label: dto.label });
  ```

### 8. Error Tracking
- Unhandled exceptions reaching the global exception filter are logged with full stack trace
  server-side, tagged with `requestId`, and with `serviceContext` making them eligible for
  Cloud Error Reporting aggregation — no separate Sentry/Error Reporting SDK required.
- `exceptionType` on every filter log enables log-based metrics and alert policies keyed to
  specific exception classes, not just HTTP 5xx rate.

### 9. Metrics & Dashboards
- Rely on Cloud Run's built-in request metrics as the baseline.
- Add custom metrics only for business-specific signals: queue depth, domain counters, job
  processing time — via log-based metrics derived from structured log fields (preferred) or
  Cloud Monitoring custom metrics API.

### 10. Alerting & SLOs
- Define alerting policies for: error rate, p95/p99 latency, `/ready` failures, Cloud Run
  instance count at max.
- See `references/monitoring-alerting.md` for Terraform-defined alert policy definitions.

---

## Review Checklist

When doing a full observability review of a module or PR, verify all of the following:

**Service-Level Logging**
- [ ] Every service method opens with `const ctx = { ...primaryIds }` and spreads it into every log call
- [ ] Every log call carries `step: 'snake_case_name'` as a queryable structured field
- [ ] Method entry logged at `log` (writes) or `debug` (reads)
- [ ] Exactly **one** `info`/`log` at `step: 'complete'` per write method — no duplicate success signals (e.g., a "committed" info AND a "created successfully" info for the same operation)
- [ ] Transaction-internal steps (`persist_entity`, `deduct_credits`) logged at `debug`, not `info` — they are implementation details, not business events
- [ ] Each guard-passed confirmation emits exactly **one** `debug` — not a `debug` before and after the same check
- [ ] Every business rule rejection (not-found, duplicate, self-action, insufficient credits) has an explicit `warn` immediately before the `throw`, capturing local entity IDs
- [ ] Every DB write, transaction commit, and external service call has a `debug` milestone log
- [ ] `prisma.$transaction(...)` and external HTTP calls are wrapped in try/catch with log-and-rethrow
- [ ] All catch blocks use `serializeError(err)` — no ad-hoc `(err as ...).stack` casts
- [ ] Read-only methods (`findOne`, `findAll`) have `debug` entry/exit only — no unnecessary `info` logs

**PII & Content Safety**
- [ ] No names, emails, phone numbers, or free-text user-provided strings in any log payload
- [ ] Free-text fields logged as boolean flags (`hasLabel: boolean`) not their content
- [ ] `publicValue` (decrypted) never logged; `publicValueHash`/`publicValueMasked` are safe

**Infrastructure Logging**
- [ ] `LoggingInterceptor` uses `tap(fn)` (success-only), NOT `tap({next, error})` — no error tap
- [ ] `GlobalExceptionFilter` emits `exceptionType`, `statusCode`, `latencyMs` on every error log
- [ ] `requestStart` is set in CLS by the `ClsModule` middleware setup (`cls.set('requestStart', Date.now())`)
- [ ] No `console.log`/`console.error` — all logging through `LoggerService.forContext(...)`

**Correlation**
- [ ] `LoggerService.forContext()` auto-injects `requestId` (and `traceContext`) from CLS
- [ ] `cls.isActive()` guarded before reading CLS values outside request context
- [ ] Cloud Trace context captured and attached (`logging.googleapis.com/trace` field)

**Error Handling**
- [ ] Global exception filter logs full error detail server-side, returns sanitized response to client
- [ ] `serviceContext` field not stripped from GCP logger config (breaks Cloud Error Reporting)
- [ ] `exceptionType` field present on filter error logs (enables structured audit queries)

**Monitoring**
- [ ] `/health` has an uptime check independent of Cloud Run's container-level probing
- [ ] Alerting policies exist for error rate, latency, and `/ready` failures
- [ ] New async flows have corresponding log-based metrics if failure wouldn't surface in request metrics
