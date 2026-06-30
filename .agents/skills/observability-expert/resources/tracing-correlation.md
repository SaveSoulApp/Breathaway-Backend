# Request Correlation & Tracing

Reference for propagating a request/correlation ID through every log line for a request, and
correlating logs with Cloud Trace spans, in this project's plain-`pino`-based `LoggerService`
(no `pino-http`, no `nestjs-pino` request-scoping — see `pino-logging.md` section 1 for why).

---

## 1. Why Correlation IDs Matter

A single user-facing request often produces log lines from multiple layers: the controller,
one or more use cases, the repository, event listeners reacting to a domain event. Without a
shared correlation ID, reconstructing what happened during a single request means manually
correlating logs by approximate timestamp. With a correlation ID in every log line, a single
Cloud Logging query (`jsonPayload.requestId="..."`) returns the complete picture.

---

## 2. No `pino-http` — Correlation Must Be Threaded Explicitly via CLS

Because `LoggerService` is a singleton `pino` wrapper rather than `pino-http`'s per-request
middleware, there's no automatic mechanism attaching a request ID to every log line the way
`pino-http`'s `customProps` would. This project must thread the request ID through explicitly
via `nestjs-cls` (`ClsService`, already part of the standard DI/test-mock set per
`test-automation-expert`), and `forContext()` callers pass it as part of `meta` — it is **not**
automatic the way `pino-http` would make it.

This is the most important practical difference from a `nestjs-pino` setup: **every log call
site that wants the request ID present must include it in `meta` explicitly**, either directly
or via a thin wrapper. Two viable approaches — pick one as the project standard, don't mix both:

### Approach A — explicit `meta.requestId` at every call site (more visible, more boilerplate)
```typescript
this.logger.forContext('ProfilesService').info('Profile created', {
  userId,
  requestId: this.cls.get('requestId'),
});
```

### Approach B (recommended) — wrap `forContext()` to auto-inject `requestId` from CLS
Extend `LoggerService` so `forContext()` reads the current CLS request ID once and merges it
into every call automatically, removing the need for every call site to remember to pass it:

```typescript
// core/logger/logger.service.ts
constructor(
  private readonly configService: ConfigService,
  private readonly cls: ClsService,
) { /* ... existing setup ... */ }

forContext(context: string): ContextualLogger {
  const childLogger = this.baseLogger.child({ context });
  const withRequestId = (meta?: Record<string, unknown>) => ({
    ...meta,
    requestId: this.cls.isActive() ? this.cls.get('requestId') : undefined,
  });

  return {
    debug: (message, meta) => this.write(childLogger, 'debug', message, withRequestId(meta)),
    info:  (message, meta) => this.write(childLogger, 'info', message, withRequestId(meta)),
    warn:  (message, meta) => this.write(childLogger, 'warn', message, withRequestId(meta)),
    error: (message, meta) => this.write(childLogger, 'error', message, withRequestId(meta)),
    log:   (message, meta) => this.write(childLogger, 'info', message, withRequestId(meta)),
  };
}
```
`this.cls.isActive()` guards against calling `.get()` outside any CLS context (e.g., during
app bootstrap, before any request has been received) — `ClsService.get()` outside an active
context either returns `undefined` or throws depending on version/config, so guard explicitly
rather than relying on that behaviour implicitly.

**This is the recommended approach** — it makes correlation-ID inclusion the default behaviour
of `forContext()` rather than something every developer must remember to do at every call site,
which is exactly the kind of easy-to-forget discipline that silently degrades over time as a
codebase grows. Implement this once in `LoggerService`, not per-call-site.

---

## 3. Setting the Request ID into CLS

```typescript
// app.module.ts
ClsModule.forRoot({
  middleware: {
    mount: true,
    generateId: true,
    idGenerator: (req: Request) =>
      (req.headers['x-request-id'] as string) ?? randomUUID(),
    setup: (cls, req: Request, res: Response) => {
      cls.set('requestId', cls.id);   // nestjs-cls exposes the generated/extracted ID as cls.id
      res.setHeader('x-request-id', cls.id);
    },
  },
})
```

**Rules:**
- Prefer an incoming `x-request-id` header (from an upstream service or load balancer) over
  always generating a fresh one, to preserve cross-service correlation when this API is called
  by another internal service.
- Echo the request ID back on the response header (`x-request-id`) so a client or upstream
  caller can correlate their own logs with this service's logs for the same request.
- This replaces any separate `RequestIdMiddleware` — `nestjs-cls`'s built-in `idGenerator` +
  `setup` hook handles both ID generation/extraction and CLS storage in one place; don't run a
  redundant middleware alongside it.

---

## 4. Cloud Trace Correlation

Cloud Run automatically injects an `X-Cloud-Trace-Context` header on incoming requests when
Cloud Trace is enabled on the project, in the form `TRACE_ID/SPAN_ID;o=TRACE_TRUE`.

> ⚠️ Verify Cloud Trace is actually enabled on this GCP project
> (`gcloud services list --enabled | grep cloudtrace`) before relying on this header being
> present — it is not automatic on every Cloud Run service by default.

Extract and store it in CLS alongside the request ID, then include it in `forContext()`'s
auto-injected metadata the same way:

```typescript
// In the ClsModule setup hook (section 3)
setup: (cls, req: Request, res: Response) => {
  cls.set('requestId', cls.id);
  res.setHeader('x-request-id', cls.id);

  const traceHeader = req.headers['x-cloud-trace-context'] as string | undefined;
  if (traceHeader) {
    const [traceId] = traceHeader.split('/');
    cls.set('gcpTrace', `projects/${process.env.GCP_PROJECT_ID}/traces/${traceId}`);
  }
},
```

```typescript
// In LoggerService.forContext()'s withRequestId helper, extend to also include the trace field
const withRequestId = (meta?: Record<string, unknown>) => ({
  ...meta,
  requestId: this.cls.isActive() ? this.cls.get('requestId') : undefined,
  'logging.googleapis.com/trace': this.cls.isActive() ? this.cls.get('gcpTrace') : undefined,
});
```

The field name `logging.googleapis.com/trace` is a Cloud Logging special field — when present
with the correctly formatted trace resource name, the GCP Logs Explorer automatically renders a
link to the associated Cloud Trace timeline directly from the log entry. Confirm this field
survives Pino's structured output unmodified (it will, since Pino doesn't treat dots in key
names specially — but verify in an actual emitted log line in the GCP console after wiring
this up, since this is the kind of thing that's easy to get subtly wrong and only notice when
the trace link doesn't appear).

---

## 5. Propagation Through Event Listeners

`EventEmitter2`'s default synchronous-within-tick emission generally preserves the active CLS
context automatically, since it doesn't hop to a genuinely new async execution context. This
means an `@OnEvent(...)` handler firing during request handling will still see the correct
`requestId`/`gcpTrace` via `ClsService.get(...)` without any extra wiring, as long as
`LoggerService.forContext()` is implemented per section 2's recommended approach.

```typescript
@Injectable()
export class OrderCreatedListener {
  constructor(
    private readonly logger: LoggerService,  // requestId auto-included, no manual passing needed
  ) {}

  @OnEvent('order.created')
  async handle(event: OrderCreatedEvent) {
    this.logger.forContext('OrderCreatedListener').info('Handling order created event', {
      orderId: event.orderId,
    });
  }
}
```

> ⚠️ If event handling is ever moved off in-process `EventEmitter2` to a queue (Cloud Tasks,
> Pub/Sub, BullMQ), CLS context does **not** survive a process/queue boundary. The request ID
> must be explicitly serialized into the job payload and re-established in a fresh CLS context
> when the job is picked up by the consumer. This is exactly the seam a future
> `background-jobs-expert` skill should own — flag it there, don't try to solve it in this file.

---

## 6. Correlation in Cloud Scheduler-Triggered Jobs

Scheduled jobs (per `devops-gcp-expert`'s Cloud Scheduler integration) are still standard HTTP
requests into the app, so the same `ClsModule` middleware applies automatically — there's no
real "user request" to trace back to, but a fresh request ID is still generated and still
useful for grouping all log lines from that one job execution:

```typescript
@UseGuards(InternalJobGuard)
@Controller('internal/jobs')
export class InternalJobsController {
  constructor(private readonly logger: LoggerService) {}

  @Post('nightly-cleanup')
  async runNightlyCleanup() {
    // requestId is already attached automatically via forContext()'s CLS read
    this.logger.forContext('InternalJobsController').info('Starting nightly cleanup job');
  }
}
```

---

## 7. Correlating Across Internal Services (If/When Applicable)

If this backend ever calls another internal service, propagate the request ID forward as an
outgoing header so the correlation chain survives the service boundary:

```typescript
async callDownstreamService(payload: unknown) {
  const requestId = this.cls.get('requestId');
  return this.httpClient.post('/downstream-endpoint', payload, {
    headers: { 'x-request-id': requestId },
  });
}
```
The downstream service's own `ClsModule` `idGenerator` will see this incoming header and reuse
it (per section 3's "prefer incoming header" rule) rather than generating a new one.

---

## 8. Review Checklist

- [ ] `ClsModule` configured with `idGenerator` honoring an incoming `x-request-id` header
- [ ] `LoggerService.forContext()` auto-injects `requestId` (and `gcpTrace` if Cloud Trace is
      enabled) from CLS into every log call — not left to individual call sites to remember
- [ ] `cls.isActive()` (or equivalent) guarded before reading CLS values, to avoid errors when
      logging happens outside any request context (e.g., app bootstrap)
- [ ] Response includes an `x-request-id` header echoing the correlation ID back to the caller
- [ ] Cloud Trace integration verified against an actual emitted log line in the GCP console,
      not assumed to work from code review alone
- [ ] Outgoing calls to other internal services forward the `x-request-id` header
- [ ] Cloud Scheduler-triggered internal job endpoints are covered by the same `ClsModule`
      middleware (verify it isn't excluded alongside health-check routes)
- [ ] No `pino-http`/`nestjs-pino` introduced alongside this — correlation stays CLS-driven,
      consistent with `pino-logging.md`'s plain-Pino architecture
