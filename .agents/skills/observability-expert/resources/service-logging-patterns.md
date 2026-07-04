# Service-Level Logging Patterns

Reference for implementing step-level milestone logging inside NestJS service methods — the
standard for this project established from `LikesService` and `ProfilesService` production usage.

This is the "how logging looks inside a service" complement to `pino-logging.md` (which covers
the `LoggerService` implementation) and `tracing-correlation.md` (which covers the request-ID
threading mechanism that makes these logs queryable together).

---

## 1. The Core Principle: Milestone Logging at Boundary Crossings

Do not log every line. Do not log only on errors. Log at **decision points and state
transitions** — every external call, every DB write, every business-meaningful branch that
could plausibly be the point of failure.

**The test:** If this method partially failed at 3am, would this log line alone tell someone
which step failed, for which entity IDs, without needing a debugger or reproduction? If not —
add the log.

**The boundary-crossing rule:**

| ✅ Always log | ❌ Don't log |
|---|---|
| External service call result (success or failure) | Every variable assignment |
| DB write (CREATE, UPDATE, DELETE) committed | Internal calculations |
| Transaction committed or rolled back | Loop iterations (use `debug` if needed) |
| Business rule guard triggered (duplicate check, self-check, etc.) | Helper method calls with no side effects |
| Async fire-and-forget dispatch | Intermediate transformations |
| Business state transition (status change) | Purely structural code |

---

## 2. The `ctx` Pattern — Base Context Object

Every method must establish a base context object `ctx` as its first statement. This object
contains the primary entity IDs for that operation and is spread into every log call.

```typescript
async create(userId: string, dto: CreateLikeRequestDto) {
  const ctx = { userId, targetIdentityId: dto.targetIdentityId };
  this.logger.log('Like creation started', { ...ctx, step: 'init' });
  // ...
}
```

**Rules:**
- Always build `ctx` first — even for read-only methods.
- Always spread `ctx` into every log in that method — never inline the same fields ad hoc.
- Add operation-specific fields (e.g., `likeId`, `resolvedIdentityId`) to individual log calls
  on top of the spread `ctx`, once they are known.
- `ctx` is not logged directly — always spread it: `{ ...ctx, step: '...' }`.

```typescript
// ✅ Correct — ctx established at top, spread everywhere consistently
async findOneForUser(id: string, userId: string) {
  const ctx = { likeId: id, userId };
  this.logger.debug('Fetching single like', ctx);
  // ...
  if (!like) {
    this.logger.warn('Like not found', ctx);  // same ctx
    throw new LikeNotFoundException(id);
  }
  this.logger.debug('Like found', { ...ctx, status: like.status });
}

// ❌ Wrong — fields inlined ad hoc per call, inconsistent across method
async findOneForUser(id: string, userId: string) {
  this.logger.debug('Fetching single like', { likeId: id, userId });
  // ...
  this.logger.warn('Like not found', { likeId: id });  // userId missing
}
```

---

## 3. The `step` Field — Queryable Step Identity

Every log call within a multi-step method must carry a `step` field that names the current
step as a snake_case string. This field is queryable as a structured log attribute in Cloud
Logging — `jsonPayload.step="duplicate_check"` — and is what enables the "A succeeded, B
succeeded, C failed" audit trace without text searching.

**One log per step milestone.** Each step should produce exactly one log at its level — either
a `debug` on pass or a `warn`/`error` on failure. Do not emit both a step-specific log AND a
method-level summary log that say the same thing at the same level:

```typescript
// ❌ Wrong — two info logs for the same fact (transaction commit + method exit)
this.logger.log('Like and credit deduction committed', { ...ctx, step: 'persist_and_deduct' });
// ... 5 lines later ...
this.logger.log('Like created successfully', { ...ctx, step: 'complete' });

// ✅ Correct — transaction internals at debug (implementation detail), one info at exit (business event)
this.logger.debug('Like record persisted within transaction', { ...ctx, step: 'persist_like' });
this.logger.debug('Credits deducted within transaction', { ...ctx, step: 'deduct_credits' });
// ... transaction block closes ...
this.logger.log('Like created successfully', { ...ctx, step: 'complete', likeId: like.id });
```

The rule: **transaction internals are `debug`** (they are implementation details of how the
business event was achieved). **The single `log` at `step: 'complete'`** is the business-level
milestone that answers "did the operation succeed?". Two `info` logs per operation for the same
fact adds noise without adding trace value — at scale, log volume is billed.

Steps should be named consistently across the service. Standard step names for like/entity
creation flows:

| Step name | When |
|---|---|
| `init` | Entry log at the start of the method |
| `credit_check` | Before/after crediting or debit validation |
| `identity_resolution` | Identity lookup or creation |
| `identity_validation` | Ownership, self-check, existence guard |
| `duplicate_check` | Uniqueness constraint guard |
| `persist_like` / `persist_entity` | DB write inside a transaction |
| `deduct_credits` | Credits deduction within a transaction |
| `persist_and_deduct` | Transaction-level catch (covers both) |
| `match_resolution` | Async downstream dispatch |
| `fetch` | DB read in read-only or update methods |
| `status_check` | Status validation before write |
| `complete` | Final success log at method exit |

```typescript
this.logger.warn('Like creation failed: already liked', {
  ...ctx,
  step: 'duplicate_check',   // ← queryable field
  existingLikeId: existingLike.id,
});
```

---

## 4. Log Level Decision Table

For a given point in a service method, choose the level as follows:

| Level | Use for |
|---|---|
| `log` / `info` | Method entry on write operations, **one** canonical success log at method exit (`step: 'complete'`) |
| `debug` | Method entry on read-only operations, every guard-passed confirmation, every step inside a transaction, intermediate state (which branch was taken, what the DB returned) |
| `warn` | Any expected business rule rejection *before* throwing the domain exception — captures local variable context the global filter can't see |
| `error` | Infrastructure call failure (DB down, external service failed) — log-and-rethrow, never swallow |

**The one-info-per-operation rule:**

Each service method must have exactly **one** `info`-level log at `step: 'complete'` — the
canonical record that the business operation succeeded. Every intermediate step (transaction
internals, guard confirmations, resolution branches) is `debug`. This boundary is not arbitrary:

- `info` = a business event that an analyst or on-call engineer cares about at any time
- `debug` = an implementation detail that an engineer needs only during active diagnosis

A `debug` log inside a transaction (`persist_like`, `deduct_credits`) is an implementation
detail of *how* the business event happened. The `info` log at exit is the event itself.
Emitting both a transaction-boundary `info` AND a method-exit `info` for the same operation
is the canonical duplicate-success-signal anti-pattern — it doubles log volume for every
successful write with no additional diagnostic value.

Apply the same rule to `debug`: each guard-passed confirmation should emit **one** `debug` —
not a `debug` before the check and another `debug` after. The check either fails (→ `warn` +
`throw`) or passes (→ one `debug` at the passing step, then move on).

**Read methods** (`findOne`, `findAll`): Entry and completion at `debug` only — they are not
business events. The only `warn` is on not-found, which triggers before throwing.

**Write methods** (`create`, `update`, `delete`): Entry at `log`, intermediate checks at
`debug`, each transaction-internal write at `debug`, single exit success at `log`.

---

## 5. The Full Create Method Template

The canonical multi-step pattern for a create operation with guards, transaction, and
async side-effects:

```typescript
async create(userId: string, dto: CreateEntityRequestDto) {
  const ctx = { userId, targetId: dto.targetId };
  this.logger.log('Entity creation started', { ...ctx, step: 'init' });

  // --- Step 1: Guard (credit check, quota, etc.) ---
  const isAllowed = await this.dependencyService.check(userId);
  if (!isAllowed) {
    this.logger.warn('Entity creation failed: guard rejected', {
      ...ctx,
      step: 'guard_check',
    });
    throw new InsufficientCreditsException();
  }
  this.logger.debug('Guard check passed', { ...ctx, step: 'guard_check' });

  // --- Step 2: Resolution (lookup or create a related entity) ---
  const target = await this.prisma.target.findUnique({ where: { id: dto.targetId } });
  if (!target) {
    this.logger.warn('Entity creation failed: target not found', {
      ...ctx,
      step: 'target_resolution',
    });
    throw new TargetNotFoundException();
  }
  this.logger.debug('Target resolved', { ...ctx, step: 'target_resolution', targetId: target.id });

  // --- Step 3: Duplicate check ---
  const existing = await this.prisma.entity.findFirst({ where: { userId, targetId: target.id } });
  if (existing) {
    this.logger.warn('Entity creation failed: duplicate', {
      ...ctx,
      step: 'duplicate_check',
      existingId: existing.id,
    });
    throw new AlreadyExistsException();
  }
  this.logger.debug('Duplicate check passed', { ...ctx, step: 'duplicate_check' });

  // --- Step 4: Atomic write (transaction) ---
  let entity: CreateEntityResult;
  try {
    entity = await this.prisma.$transaction(async (tx) => {
      const created = await tx.entity.create({ data: { userId, targetId: target.id } });
      this.logger.debug('Entity persisted within transaction', {
        ...ctx,
        step: 'persist_entity',
        entityId: created.id,
      });

      await this.dependencyService.consumeQuota({ userId, referenceId: created.id }, tx);
      this.logger.debug('Quota deducted within transaction', {
        ...ctx,
        step: 'deduct_quota',
        entityId: created.id,
      });

      return created;
    });
  } catch (err) {
    this.logger.error('Entity creation transaction failed', {
      ...ctx,
      step: 'persist_and_deduct',
      err: serializeError(err),
    });
    throw err;  // rethrow — global filter returns sanitized response, local log preserves context
  }

  // --- Step 5: Non-fatal async side-effect ---
  this.asyncService.trigger(entity).catch((err) => {
    this.logger.error('Async side-effect failed after entity creation', {
      ...ctx,
      step: 'async_trigger',
      entityId: entity.id,
      err: serializeError(err),
    });
  });
  this.logger.debug('Async side-effect triggered', { ...ctx, step: 'async_trigger', entityId: entity.id });

  // --- Audit + exit ---
  this.emitAuditLog({ actionType: AuditActionType.ENTITY_CREATED, userId, resourceId: entity.id });

  this.logger.log('Entity created successfully', { ...ctx, step: 'complete', entityId: entity.id });
  return entity;
}
```

---

## 6. Wrapping Infrastructure Calls (Log-and-Rethrow)

Domain exception paths (duplicate check, self-like, not-found) all have explicit `warn` +
`throw` patterns — the domain exception carries the HTTP status and the service log carries
the entity context.

**The gap:** Infrastructure failures (DB connection dropped, external service timeout) are NOT
domain exceptions. Without a try/catch around them, the global exception filter will log the
stack trace but will NOT have `targetIdentityId`, `step`, or any local variable context —
you get "something failed" not "step C failed with these IDs".

**The rule:** Wrap any call that can fail for infrastructure reasons — specifically:
- `prisma.$transaction(...)` — highest blast radius, multiple writes atomically
- Any external HTTP service call
- Any queue publish

Wrap with try/catch, log with full `ctx` and `step`, then rethrow:

```typescript
// ✅ Correct — transaction wrapped so infra failure preserves local context
let result: SomeType;
try {
  result = await this.prisma.$transaction(async (tx) => {
    // ...
  });
} catch (err) {
  this.logger.error('Operation transaction failed', {
    ...ctx,
    step: 'persist_and_deduct',
    err: serializeError(err),
  });
  throw err;
}

// ❌ Wrong — global filter gets the stack but loses ctx, step, targetId, etc.
const result = await this.prisma.$transaction(async (tx) => {
  // ...
});
```

Do NOT wrap every individual Prisma read with try/catch — that's over-engineering. The
transaction is the right granularity because it's the highest-value call to instrument:
multiple writes are at risk together, and a transient failure there is the hardest to reproduce.

---

## 7. Standardized Error Serialization — `serializeError`

Never cast error objects at call sites:

```typescript
// ❌ Wrong — one-off cast, loses name, may miss code field
this.logger.error('Failed', { stack: (err as { stack?: string }).stack });

// ✅ Correct — consistent shape across every service
import { serializeError } from '@common/utils/error.utils';
this.logger.error('Failed', { ...ctx, step: '...', err: serializeError(err) });
```

`serializeError` (in `src/common/utils/error.utils.ts`) produces:
```typescript
{ message: string, name: string, stack: string, code?: string }
```

Use `serializeError` in every `catch` block across every service. This ensures every error log
in Cloud Logging has an identical `err.*` field shape — making log-based alert queries and
cross-service incident investigation field-consistent, not dependent on which call site happened
to include which fields.

---

## 8. PII in Log Metadata — Mandatory Rules

- **Log flags, not values.** If a field contains free-text user input (a label, a bio, a name),
  log a boolean or enum describing it — never the content itself.

  ```typescript
  // ✅ Correct
  this.logger.log('Label updated', { likeId: id, userId, labelCleared: dto.label === null });

  // ❌ Wrong — "Sarah from the gym" is PII
  this.logger.log('Label updated', { likeId: id, userId, label: dto.label });
  ```

- **Allowed in logs:** System-generated UUIDs/ULIDs (`userId`, `likeId`, `identityId`), status
  enums, numeric amounts, boolean flags, hashed values, error codes.

- **Never in logs:** Names, email addresses, phone numbers, plaintext passwords, full auth
  tokens, physical addresses, push notification tokens, free-text user-provided strings.

- **The hashed-value rule:** `publicValueHash` and `publicValueMasked` are safe to log.
  `publicValue` (the decrypted plaintext) is not — it's the user's contact info.

---

## 9. Layer Responsibility — What Each Layer Logs

Understanding which layer owns which log prevents both duplication and gaps:

| Layer | What it logs | What it does NOT log |
|---|---|---|
| **Service** | Domain context: entity IDs, step progression, business rule failures with local variable state | HTTP method/path/status (not its concern) |
| **LoggingInterceptor** | Successful request: `statusCode`, `latencyMs` at `debug` level (for local dev tracing) | Errors — the filter owns error-path HTTP logging |
| **GlobalExceptionFilter** | Error-path HTTP outcome: `statusCode`, `latencyMs`, `exceptionType`, error message | Domain context (no entity IDs — it doesn't have them) |

This three-layer split means a single `requestId` query returns:
1. The domain trace (service logs — who, what, which step)
2. The HTTP outcome (filter log — status code, latency, exception class name)

**The `LoggingInterceptor` must NOT log on error paths.** Using `tap({next, error})` puts
latency-with-wrong-status-code into the log stream, because the interceptor's `error` tap fires
before the exception filter writes the real HTTP status. The filter reads `requestStart` from
CLS (set at middleware time) to compute accurate `latencyMs` on error paths — the interceptor's
`error` tap is redundant and produces misleading `statusCode` values.

### The `exceptionType` field

The `GlobalExceptionFilter` emits `exceptionType: err.constructor.name` on every error log:

```
exceptionType: "AlreadyLikedException"   ← class name, not HTTP status
statusCode: 409                           ← HTTP outcome
error: "You already liked this person"   ← user-facing message
```

`exceptionType` is queryable as `jsonPayload.exceptionType="AlreadyLikedException"` in Cloud
Logging — use it to track frequency of specific business rule violations across all users, which
is more useful for audit and product analysis than counting 409 responses (which could come from
multiple different exceptions mapped to the same status).

### `requestStart` in CLS

The request start timestamp is stored in CLS by the `ClsModule` middleware setup
(`cls.set('requestStart', Date.now())`), not by the interceptor. This is the correct placement
because:
- The middleware runs before the interceptor chain, giving a more accurate wall-clock start
- Both the interceptor (success path) and the filter (error path) can read the same value
- `Date.now()` is correct here — this is pure millisecond arithmetic for latency, not a
  timestamp for storage. Use `DateUtil.now()` for `Date` objects; use `Date.now()` for timing.

---

## 10. What a Healthy Multi-Step Error Log Looks Like

For a `POST /api/v1/likes` that hit the duplicate check:

```
[INFO]  LikesService         "Like creation started"          step: init, userId, requestId
[WARN]  LikesService         "Like creation failed: ..."      step: duplicate_check, userId, targetIdentityId, existingLikeId, requestId
[WARN]  GlobalExceptionFilter "Request failed: POST /likes"   statusCode: 409, exceptionType: AlreadyLikedException, latencyMs: 294, requestId
```

This three-entry trace, queryable by `requestId`, tells the complete story:
- **WHO** — `userId`, `targetIdentityId`
- **WHAT** — `AlreadyLikedException`, `existingLikeId`
- **WHERE** — `step: duplicate_check` (steps 1–3 passed, stopped at 4)
- **HTTP** — `statusCode: 409`, `latencyMs: 294`

No more, no less. This is the target for every multi-step service method in this project.
