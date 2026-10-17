---
sidebar_position: 2
---

# Structured Logging & Events

This guide outlines the custom logging architecture of the BreathAway backend, which uses a hand-rolled Pino-based `LoggerService` to enforce structured JSON logging and strict business event tracking.

## Overview

We use a central `LoggerService` injected into each domain via NestJS's dependency injection. Every service extends `BaseService`, which provides a dedicated `this.logger` instance scoped to the class context (via `LoggerService.forContext(this.constructor.name)`).

The logger outputs structured JSON compatible with GCP Cloud Logging, ensuring that all log metadata, trace correlation IDs, and context fields are indexable and queryable.

## Log Levels & Usage

The logger exposes the following standard methods for diagnostic logging. These should be used to trace the lifecycle and intermediate steps of an operation:

- **`debug(message: string, meta?: object)`**: For fine-grained tracing (e.g., "Verifying extracted OTP", "Fetching user record").
- **`info(message: string, meta?: object)`**: For generic lifecycle markers that are not business completion points (e.g., "Received Pub/Sub event").
- **`warn(message: string, meta?: object)`**: For recoverable issues, suppressed operations (e.g., "Active match already exists — duplicate prevented"), or unexpected edge cases.
- **`error(message: string, meta?: object)`**: For failures and exceptions. Always include `err: serializeError(error)` in the metadata.

> **Important Constraint**: Never use `debug`, `info`, or `warn` to represent the final completion state of a business action. For business outcomes, use `event()`.

## Business Events: The `event()` Method

The core of our operational observability is the `.event(eventName, meta)` method.

We use this **strictly for business completion points** (e.g., successfully creating an identity, processing a subscription, matching two users).

### Rules for `event()`

1. **One Event Per Business Outcome**: Only call `.event()` when a business process successfully completes.
2. **Strong Typing via `LOG_EVENT`**: The first argument must be one of the strictly typed events defined in `src/core/logger/log-event.constants.ts`. You cannot pass arbitrary strings.
3. **No Human-Readable Messages**: Unlike `.info()` or `.debug()`, `.event()` does not take a human-readable string. The `LOG_EVENT` constant _is_ the message.
4. **Rich Metadata**: Always provide relevant IDs (e.g., `userId`, `matchId`, `transactionId`) in the metadata object so the event can be tracked in analytics or GCP Log Explorer.
5. **No PII**: Never log raw tokens, passwords, real names, or raw contact info in the metadata.

### Example

```ts
import { LOG_EVENT } from '@core/logger';

// Inside a service extending BaseService
this.logger.event(LOG_EVENT.MATCH_CREATED, {
  userId: userOneId,
  matchId: finalMatch.id,
});
```

## Adding New Events

When implementing a new feature that has a distinct business outcome, you must register a new event:

1. Open `src/core/logger/log-event.constants.ts`.
2. Add the `UPPER_SNAKE_CASE` string literal to the `LogEvent` union type.
3. Add the exact same string to the exported `LOG_EVENT` constant object.

## Testing Loggers

In unit tests (`*.spec.ts`), the contextual logger is typically mocked. Ensure your mock includes `event: jest.fn()` (and `info`, `warn`, `error`, `debug`, `log` as needed).

```ts
let contextualLogger: {
  info: jest.Mock;
  error: jest.Mock;
  warn: jest.Mock;
  debug: jest.Mock;
  event: jest.Mock;
  log: jest.Mock; // Legacy, being phased out
};

// Asserting an event
expect(contextualLogger.event).toHaveBeenCalledWith(
  LOG_EVENT.IDENTITY_CREATED,
  expect.objectContaining({ userId: '123' }),
);
```

---

## HTTP Request Lifecycle & Noise Elimination

Incoming HTTP traffic is monitored globally by [`LoggingInterceptor`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/core/logger/logging.interceptor.ts). To maintain production observability without degrading container throughput or inflating Cloud Logging ingestion costs, the interceptor adheres to two strict design principles:

### 1. `DEBUG` Level for Per-Request Lifecycle Markers

GCP Cloud Run natively captures access logs for every inbound HTTP connection. Emitting application `INFO` logs on every request would generate excessive duplication and noise.

Therefore, `LoggingInterceptor` emits:

- **`Incoming request`** (`DEBUG`): Emitted upon request receipt, capturing method, URL, and client metadata.
- **`Request completed`** (`DEBUG`): Emitted upon response transmission, capturing the HTTP status code and measured latency (`durationMs`).

These entries are invisible in standard production environments (running at `INFO` severity), but can be dynamically enabled by setting `LOG_LEVEL=debug` for real-time traffic analysis.

### 2. Single Source of Truth for Exceptions

Earlier architectures intercepted errors in both the interceptor and global exception filters, leading to duplicate error log lines and competing stack traces for a single failure.

Under our decoupled model:

- `LoggingInterceptor` **does not** catch or log errors.
- Unhandled domain exceptions bubble straight to [`GlobalExceptionFilter`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/core/exception-filters/global-exception.filter.ts) and [`PrismaExceptionFilter`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/infrastructure/database/exception-filters/prisma-exception.filter.ts).
- This guarantees exactly **one** canonical, structured `ERROR` log entry per failed request in GCP Cloud Logging, complete with trace context and sanitized error serialization.

---

## Asynchronous Queue Boundary Trace Propagation (GCP Pub/Sub)

When an operation fans out to Google Cloud Pub/Sub, the `AsyncLocalStorage` context does not cross the network boundary automatically. Without context propagation, downstream subscribers generate disconnected logs that cannot be traced back to the user request.

We bridge the queue boundary via coordinated publisher and subscriber mechanics:

1. **Outbound Injection ([`PubSubPublisherService`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/pubsub/pubsub-publisher.service.ts))**: Automatically extracts `requestId` and `traceContext` from the active CLS store and attaches `originRequestId` and `traceContext` as Pub/Sub message attributes.
2. **Inbound Restoration ([`PubSubIngestionController`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/pubsub/pubsub-ingestion.controller.ts))**: Extracts `originRequestId` and `traceContext` from incoming message attributes before invoking registered `@PubSubListener` handlers.
3. **Trace Unified in Cloud Logging**:
   - `requestId` in CLS is set to `originRequestId` (falling back to `messageId` if unpublished internally).
   - `pubsubMessageId` is preserved in CLS for tracking across message retries in BigQuery.
   - `traceContext` is seeded in CLS, ensuring that all log entries emitted by background workers carry the matching `logging.googleapis.com/trace` identifier and nest cleanly within the originating HTTP Cloud Trace waterfall.
