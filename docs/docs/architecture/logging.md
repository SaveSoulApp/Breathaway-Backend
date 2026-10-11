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
