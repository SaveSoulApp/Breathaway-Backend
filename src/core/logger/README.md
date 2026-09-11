# Logger — Developer Guide

> Last updated: 2026-09-10 · Schema version: **1**

Authoritative reference for structured logging in this project. Read before writing your first log line.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Log Schema](#log-schema)
3. [How To Log](#how-to-log)
4. [Typed Event Names (`LOG_EVENT`)](#typed-event-names-log_event)
5. [CLS Correlation — requestId & traceId](#cls-correlation)
6. [Centralized Redaction](#centralized-redaction)
7. [Log Levels](#log-levels)
8. [The 3-Line Rule](#the-3-line-rule)
9. [Pub/Sub Correlation (Queue Boundary)](#pubsub-correlation)
10. [PII Prohibition](#pii-prohibition)
11. [Worked Example — POST /likes](#worked-example)
12. [Querying Logs in BigQuery](#querying-logs-in-bigquery)
13. [GCP Infrastructure Setup](#gcp-infrastructure-setup)
14. [Future Work](#future-work)

---

## Architecture Overview

```
NestJS App (Pino JSON stdout)
    │
    ▼
Cloud Run log agent  (automatic — no SDK needed in src/)
    │
    ▼
Cloud Logging  (default _Default bucket + breathaway-app-logs bucket)
    │  ← Log Sink: serviceContext.service = "breathaway-api"
    ▼
Log Bucket: breathaway-app-logs  (90-day retention, Analytics enabled)
    │
    ▼
BigQuery Linked Dataset: app_logs_dataset
    │
    ▼
Query with SQL (see §12)
```

**Key constraint**: The NestJS application **never writes directly to BigQuery**. All log data flows through stdout → Cloud Run → Cloud Logging → BigQuery automatically. There is no `@google-cloud/bigquery` SDK in `src/`.

---

## Log Schema

Every log line emitted in GCP mode is a JSON object:

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `severity` | `string` | Pino formatter | GCP enum: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |
| `timestamp` | `string` | Pino | ISO 8601 UTC |
| `schema_version` | `number` | Pino `base` | Always `1` — increment on breaking changes |
| `message` | `string` | Pino `messageKey` | Human-readable log message |
| `context` | `string` | `forContext()` | Class name (e.g., `LikesService`) |
| `event` | `string` | `logger.event()` | Typed event name (e.g., `LIKE_CREATED`) |
| `requestId` | `string` | CLS (auto) | UUID from `X-Request-ID` header |
| `logging.googleapis.com/trace` | `string` | CLS (auto) | `projects/PROJECT_ID/traces/TRACE_ID` |
| `logging.googleapis.com/spanId` | `string` | CLS (auto) | Span ID from `X-Cloud-Trace-Context` |
| `logging.googleapis.com/trace_sampled` | `boolean` | CLS (auto) | Whether the trace is sampled |
| `serviceContext.service` | `string` | Pino `base` | `APP_NAME` env var |
| `serviceContext.version` | `string` | Pino `base` | `APP_VERSION` env var |
| `gcpProjectId` | `string` | Pino `base` | GCP project ID |
| `step` | `string` | caller | Internal step (e.g., `init`, `persist_like`, `complete`) |

### Trace Field Format

`logging.googleapis.com/trace` **must** be:
```
projects/breathaway-dev/traces/abc123def456...
```

**Never** the raw header value (`abc123/456;o=1`). The `parseCloudTraceContext()` utility in `gcp-logger.config.ts` handles this correctly.

---

## How To Log

All services extend `BaseService`, which auto-provisions `this.logger` via `loggerService.forContext(this.constructor.name)`.

### Standard level methods

```ts
this.logger.debug('Checking credit balance', { userId, step: 'credit_check' });
this.logger.log('Like persisted', { likeId: like.id, step: 'persist_like' });
this.logger.warn('Duplicate like attempted', { userId, targetIdentityId });
this.logger.error('Transaction failed', { userId, err: serializeError(err) });
```

| Method | GCP Severity | Use When |
|--------|-------------|----------|
| `.debug()` | DEBUG | Intermediate state — **invisible in production** |
| `.log()` / `.info()` | INFO | Normal business milestones |
| `.warn()` | WARNING | Recoverable, unexpected-but-handled |
| `.error()` | ERROR | Unrecoverable errors, caught exceptions |

### Typed event() helper

For cross-service business events queryable by name in BigQuery:

```ts
import { LOG_EVENT } from '@core/logger';

this.logger.event(LOG_EVENT.LIKE_CREATED, {
  likeId: like.id,
  userId,
  targetIdentityId,
});
// Emits: { event: "LIKE_CREATED", likeId: "...", userId: "...", severity: "INFO", ... }
```

The `event` parameter is constrained to the `LogEvent` union — the TypeScript compiler rejects any string not in the union.

---

## Typed Event Names (`LOG_EVENT`)

All event names live in [`log-event.constants.ts`](./log-event.constants.ts). **Do not invent free-text event names at call-sites.** Add new events to the `LogEvent` union first.

```ts
import { LOG_EVENT, LogEvent } from '@core/logger';

LOG_EVENT.REQUEST_RECEIVED    // lifecycle
LOG_EVENT.LIKE_CREATED        // business
LOG_EVENT.SUBSCRIPTION_WEBHOOK_RECEIVED  // payment
// etc.
```

**Naming convention**: `RESOURCE_ACTION` in `UPPER_SNAKE_CASE`.

---

## CLS Correlation

You **never** need to pass `requestId` or trace fields manually. They are injected automatically into every log line via `nestjs-cls`.

The context is seeded in `AppModule` at request start:

```ts
cls.set('requestId', req.headers['x-request-id'] || randomUUID());
cls.set('traceContext', req.headers['x-cloud-trace-context']); // "abc123/456;o=1"
```

`LoggerService.write()` reads these values on every call and emits:

```json
{
  "requestId": "req-abc-123",
  "logging.googleapis.com/trace": "projects/breathaway-dev/traces/abc123",
  "logging.googleapis.com/spanId": "456",
  "logging.googleapis.com/trace_sampled": true
}
```

### requestId Enforcement

`RequestIdMiddleware` requires the `X-Request-ID` header on all normal HTTP routes (returns `401` if missing). Excluded for: `/pubsub/*`, Swagger docs, browser paths, internal job routes.

---

## Centralized Redaction

Pino's `redact` is configured in `gcp-logger.config.ts` via `PINO_REDACT_PATHS`. Values are replaced with `[Redacted]` **at serialization time** — before bytes hit stdout.

**Redacted fields:**
```
password, token, accessToken, refreshToken, apiKey, secret, privateKey
cardNumber, cvv, otp, pin, ssn
req.headers.authorization, req.headers.cookie
(all of the above also matched inside nested objects via *.field syntax)
```

**Rule**: Add new sensitive fields to `PINO_REDACT_PATHS` — never scrub at individual call-sites.

---

## Log Levels

| Environment | Default `LOG_LEVEL` | Visible |
|------------|--------------------|-|
| Production (`DEPLOYMENT_ENV=gcp`) | `info` | INFO, WARNING, ERROR, CRITICAL |
| Development (local) | `debug` | all |

Override with the `LOG_LEVEL` env var. Valid values: `fatal`, `error`, `warn`, `info`, `debug`, `trace`.

> **Production note**: All `debug` logs are invisible. Use `info`/`log` for milestones needed during incident investigation.

---

## The 3-Line Rule

Keep each log call to **3 fields or fewer** in the meta object (excluding `step`, `event`, `userId`):

```ts
// ✅ Good
this.logger.event(LOG_EVENT.LIKE_CREATED, {
  likeId: like.id,
  userId,
  targetIdentityId,
});

// ❌ Too noisy
this.logger.debug('Like created', {
  likeId, userId, targetIdentityId, intent, label, status,
  creditsConsumed, expiresAt, createdAt, senderProfile: { ... }
});
```

---

## Pub/Sub Correlation

Pub/Sub push delivery arrives as a new HTTP request. `AsyncLocalStorage` context does **not** cross the queue boundary automatically.

**Fix in `PubSubIngestionController.ingest()`**: CLS is seeded from the Pub/Sub `messageId`:

```ts
const correlationId = message.messageId ?? randomUUID();
this.cls.set('requestId', correlationId);
this.cls.set('pubsubMessageId', message.messageId);
```

- All `@PubSubListener` handler logs carry `requestId = messageId`
- `messageId` is stable across Pub/Sub retries → retry attempts are co-located in BigQuery queries

---

## PII Prohibition

**Never log personally identifiable information:**
- User email, phone number, name
- Physical address
- Raw identity values before masking
- Firebase UIDs (use our internal UUID `userId`)

Use `identityCryptoService.maskValue()` before logging any identity strings.

---

## Worked Example

Full log sequence for `POST /likes`:

```
1. LoggingInterceptor:
   { event: "REQUEST_RECEIVED", httpRequest.method: "POST", httpRequest.url: "/api/v1/likes", requestId: "req-abc" }

2. LikesService — credit check:
   { message: "Checking credit balance", context: "LikesService", step: "credit_check", userId: "u-1" }

3. LikesService — persist (inside $transaction):
   { message: "Like record persisted within transaction", step: "persist_like", likeId: "like-1" }

4. LikesService — credits deducted:
   { message: "Credits deducted within transaction", step: "deduct_credits", creditsConsumed: 1 }

5. LikesService — complete:
   { event: "LIKE_CREATED", likeId: "like-1", userId: "u-1", targetIdentityId: "tid-2" }

6. LoggingInterceptor:
   { event: "REQUEST_COMPLETED", statusCode: 201, durationMs: 43 }

All lines share the same requestId: "req-abc"
```

---

## Querying Logs in BigQuery

After GCP infrastructure is provisioned, logs are available in `app_logs_dataset`.

### All logs for a single request

```sql
SELECT
  timestamp,
  jsonPayload.severity,
  jsonPayload.event,
  jsonPayload.message,
  jsonPayload.context,
  jsonPayload.step,
  jsonPayload.durationMs
FROM `breathaway-dev.app_logs_dataset._AllLogs`
WHERE jsonPayload.requestId = 'req-abc-123'
ORDER BY timestamp ASC
```

### All LIKE_CREATED events in last 24 hours

```sql
SELECT
  timestamp,
  jsonPayload.requestId,
  jsonPayload.userId,
  jsonPayload.likeId,
  jsonPayload.targetIdentityId
FROM `breathaway-dev.app_logs_dataset._AllLogs`
WHERE
  jsonPayload.event = 'LIKE_CREATED'
  AND timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
ORDER BY timestamp DESC
LIMIT 100
```

### All ERROR-level logs in last hour

```sql
SELECT
  timestamp,
  jsonPayload.requestId,
  jsonPayload.message,
  jsonPayload.context,
  jsonPayload.err.message AS error_message
FROM `breathaway-dev.app_logs_dataset._AllLogs`
WHERE
  jsonPayload.severity = 'ERROR'
  AND timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
ORDER BY timestamp DESC
```

### Trace a Pub/Sub message end-to-end

```sql
-- Pub/Sub messageId becomes the requestId in all handler logs
SELECT timestamp, jsonPayload.severity, jsonPayload.event, jsonPayload.message, jsonPayload.step
FROM `breathaway-dev.app_logs_dataset._AllLogs`
WHERE jsonPayload.requestId = 'pubsub-message-id-here'
ORDER BY timestamp ASC
```

---

## GCP Infrastructure Setup

Resources are in [`terraform/audit-logs.tf`](../../../../terraform/audit-logs.tf) (resources 7-10).

```bash
cd terraform
terraform plan -out=tfplan   # review before applying
terraform apply tfplan
```

### Manual `gcloud` alternative

```bash
# 1. Create Log Bucket
gcloud logging buckets create breathaway-app-logs \
  --location=asia-south1 \
  --retention-days=90 \
  --enable-analytics \
  --project=breathaway-dev

# 2. Create Log Sink
gcloud logging sinks create breathaway-app-log-sink \
  "logging.googleapis.com/projects/breathaway-dev/locations/asia-south1/buckets/breathaway-app-logs" \
  --log-filter='resource.type="cloud_run_revision" AND jsonPayload.serviceContext.service="breathaway-api"' \
  --project=breathaway-dev

# 3. Grant sink SA bucket write permission
SINK_SA=$(gcloud logging sinks describe breathaway-app-log-sink \
  --project=breathaway-dev --format='value(writerIdentity)')
gcloud projects add-iam-policy-binding breathaway-dev \
  --member="${SINK_SA}" \
  --role="roles/logging.bucketWriter"

# 4. Create BigQuery linked dataset
gcloud logging links create app-logs-bq-link \
  --bucket=breathaway-app-logs \
  --location=asia-south1 \
  --project=breathaway-dev
```

### Required Cloud Run env vars

| Variable | Example | Purpose |
|----------|---------|---------|
| `GCP_PROJECT_ID` | `breathaway-dev` | Constructs `projects/.../traces/...` format |
| `DEPLOYMENT_ENV` | `gcp` | Enables GCP JSON log format |
| `LOG_LEVEL` | `info` | Minimum severity (use `debug` in staging) |
| `APP_NAME` | `breathaway-api` | Identifies service in `serviceContext.service` |
| `APP_VERSION` | `1.2.3` | Identifies deployment version |

---

## Future Work

> **Out of scope for this implementation** — documented for planning only.

### Financial Audit Pipeline

This logging system is for **operational observability** — debugging, incident investigation, performance monitoring. It is **not** a financial audit trail.

If credit/payment operations require an immutable, long-retention audit ledger:
- An **Outbox pattern** (append-only DB table per business transaction) should be implemented via Prisma.
- A dedicated Pub/Sub topic streams Outbox events to a long-retention BigQuery table.
- The existing `audit-logs.tf` Pub/Sub pipeline (resources 1-6) is the starting point.
- This has **no code overlap** with the logger infrastructure.

### Structured Error Codes

Future: Add a `code` field (e.g., `CREDIT_INSUFFICIENT`) alongside `event` for finer BigQuery aggregation and alerting.
