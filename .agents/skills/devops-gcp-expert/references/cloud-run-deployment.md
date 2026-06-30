# Cloud Run Deployment

Reference for statelessness, Dockerfile structure, environment configuration, scaling, startup
optimization, and Cloud Scheduler integration for a NestJS service on Cloud Run.

---

## 1. Statelessness

Cloud Run instances are ephemeral: they can be created, destroyed, or scaled to zero between
requests, and a single instance may serve many concurrent requests (if concurrency > 1) or be
recycled mid-session. Design accordingly:

- **No local filesystem persistence.** Anything written to disk may vanish before the next
  request, even within the "same" logical session. Use GCS for file storage, Cloud SQL/Prisma
  for structured data.
- **`/tmp` is request-scoped only.** Using `/tmp` for transient processing (e.g., resizing an
  image before uploading to GCS) is fine; using it as a cache between requests is not, since
  there's no guarantee of instance reuse and `/tmp` is an in-memory tmpfs that counts against
  the instance's memory limit.
- **No in-memory session/queue state.** Don't implement an in-process job queue, rate limiter
  state, or session store as a JS object/Map — it won't be shared across instances and will be
  lost on scale-down. Use Cloud Tasks, Redis (Memorystore), or the database instead.

---

## 2. Dockerfile — Multi-Stage Build for NestJS + Prisma

```dockerfile
# ---- Builder stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies (leverage Docker layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# Prune dev dependencies, keeping only what's needed at runtime
RUN npm prune --production

# ---- Runner stage ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

# Copy only what's needed to run
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs

EXPOSE 8080

CMD ["node", "dist/main.js"]
```

**Rules:**
- `npm ci`, never `npm install`, in CI/Docker builds — ensures reproducible installs from the
  lockfile.
- Copy `package.json`/`package-lock.json` before the rest of the source so Docker can cache
  the `npm ci` layer when only application code changes.
- Run `npx prisma generate` in the builder stage, and copy the `prisma/` folder (containing the
  generated client's schema reference) into the runner — the generated client itself lives in
  `node_modules/.prisma`, which is included via the `node_modules` copy.
- Never copy `.env` files into the image. Configuration comes from Cloud Run environment
  variables and Secret Manager at runtime.
- Always create and use a non-root user in the final stage.

### `.dockerignore`
```
node_modules
dist
.env
.env.*
.git
.github
*.md
test
coverage
.vscode
```

---

## 3. Port Binding

```typescript
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // ...
  const port = process.env.PORT || 8080;
  await app.listen(port, '0.0.0.0');   // bind to 0.0.0.0, not localhost/127.0.0.1
}
```

**Rules:**
- Cloud Run injects `PORT` (default 8080) — never hardcode a different port in `app.listen()`.
- Bind to `0.0.0.0`, not `localhost` — Cloud Run's networking layer needs the container to
  accept connections on all interfaces, not just loopback.

---

## 4. Startup Time Optimization

Cloud Run measures container startup against a startup probe; slow startup delays availability
during scale-from-zero or deploys, and can hit Cloud Run's startup timeout (default 4 minutes,
configurable).

- **Lazy-load heavy modules.** If a NestJS module wraps an expensive SDK client (e.g., a large
  ML library, infrequently used integration), consider lazy module loading via NestJS's
  `LazyModuleLoader` rather than eagerly initializing it in `AppModule`'s root import graph.
- **Avoid synchronous blocking work in `bootstrap()`.** Don't run long migrations or heavy
  seed/setup logic as part of app startup — migrations should run as a separate CI/CD step
  (`prisma migrate deploy`) before the new revision receives traffic, not inside the app process.
- **Defer non-critical connections.** If a service connects to multiple external systems,
  ensure the Prisma connection (needed for `/ready` to pass) initializes early, but
  non-essential integrations (e.g., an analytics SDK) can initialize lazily on first use rather
  than blocking startup.
- **Set min-instances for latency-sensitive services** (see section 5) so cold starts aren't
  on the hot path for user-facing traffic at all.

---

## 5. Scaling Configuration

```hcl
# Reference values — actual config lives in Terraform, see terraform-standards.md
resource "google_cloud_run_v2_service" "api" {
  template {
    scaling {
      min_instance_count = 1    # production: avoid cold starts; staging: can be 0
      max_instance_count = 20   # bound to prevent runaway scale-up exhausting Cloud SQL connections
    }
    containers {
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true   # "CPU only allocated during requests" — false for always-on workloads
      }
    }
  }
}
```

**Guidance:**
- `min_instance_count = 0` is acceptable for staging/dev or genuinely low-traffic services
  where occasional cold-start latency is tolerable.
- `min_instance_count >= 1` for production user-facing APIs to eliminate cold starts on the
  request path.
- `max_instance_count` must be set with Cloud SQL's max connection limit in mind: 
  `max_instance_count × per_instance_prisma_pool_size` should stay safely under Cloud SQL's
  configured max connections, accounting for other services sharing the same instance.
  Cross-reference the `prisma-optimizer` skill's connection pooling section.
- `cpu_idle = true` (CPU only during request processing) is cheaper and correct for typical
  request/response APIs; set `cpu_idle = false` only for services doing background work
  outside the request lifecycle (rare for a typical NestJS REST API).

---

## 6. Health Checks (Cloud Run Probes)

Cloud Run supports startup and liveness probes pointed at HTTP endpoints. Wire these to the
`/health` and `/ready` endpoints required by the `api-design-expert` skill:

```hcl
containers {
  startup_probe {
    http_get {
      path = "/health"
    }
    initial_delay_seconds = 0
    timeout_seconds        = 3
    period_seconds          = 5
    failure_threshold       = 3
  }
  liveness_probe {
    http_get {
      path = "/health"
    }
    period_seconds    = 10
    timeout_seconds   = 3
    failure_threshold = 3
  }
}
```
Use `/health` (no DB dependency) for the liveness probe to avoid restarting healthy instances
during a transient DB blip, and reserve `/ready` (which checks Prisma connectivity) for traffic
admission decisions rather than container liveness.

---

## 7. Cloud Scheduler → Cloud Run Integration

### Pattern: authenticated OIDC invocation
Cloud Scheduler jobs that trigger Cloud Run endpoints must authenticate, not call a public
unauthenticated route:

```hcl
resource "google_cloud_scheduler_job" "nightly_cleanup" {
  name      = "nightly-cleanup"
  schedule  = "0 2 * * *"          # 2 AM daily
  time_zone = "Etc/UTC"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.api.uri}/internal/jobs/nightly-cleanup"

    oidc_token {
      service_account_email = google_service_account.scheduler_invoker.email
      audience               = google_cloud_run_v2_service.api.uri
    }
  }

  retry_config {
    retry_count = 2
  }
}

resource "google_service_account" "scheduler_invoker" {
  account_id   = "scheduler-invoker"
  display_name = "Cloud Scheduler Cloud Run Invoker"
}

resource "google_cloud_run_v2_service_iam_member" "scheduler_invoke" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler_invoker.email}"
}
```

### Application side: verify the OIDC token and restrict the route
```typescript
// internal-jobs.guard.ts
@Injectable()
export class InternalJobGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractToken(request);  // same Bearer extraction as FirebaseAuthGuard
    if (!token) throw new UnauthorizedException();

    // Verify as a Google-issued OIDC token (not a Firebase user token) —
    // use google-auth-library's OAuth2Client.verifyIdToken with the expected audience
    const ticket = await this.oauthClient.verifyIdToken({
      idToken: token,
      audience: this.configService.getOrThrow('CLOUD_RUN_SERVICE_URL'),
    });
    const payload = ticket.getPayload();
    if (payload.email !== this.configService.getOrThrow('SCHEDULER_SA_EMAIL')) {
      throw new ForbiddenException('Unexpected caller');
    }
    return true;
  }
}
```

```typescript
@UseGuards(InternalJobGuard)
@Controller('internal/jobs')
export class InternalJobsController {
  @Post('nightly-cleanup')
  async runNightlyCleanup() { ... }
}
```

**Rules:**
- Never reuse `FirebaseAuthGuard` for scheduler-triggered endpoints — the caller is Google's
  infrastructure presenting a Google-signed OIDC token, not an end-user Firebase token. Use a
  distinct guard that verifies the OIDC audience and caller service account email.
- Restrict internal job routes under a distinct path prefix (e.g., `/internal/jobs/*`) so
  they're easy to exclude from public Swagger docs and easy to audit as a group.
- Design every scheduled job handler to be **idempotent** — Cloud Scheduler's retry config
  (and rare double-delivery) means a job may run more than once; side effects (sending emails,
  charging cards) must check-and-skip on re-execution.

---

## 8. Database Migrations in the Deploy Pipeline

Run `prisma migrate deploy` as a discrete CI/CD step **before** the new Cloud Run revision
receives traffic — never inside `main.ts`'s `bootstrap()` (every cold-start instance would
attempt to run migrations concurrently, which is both wasteful and a risk of concurrent
migration conflicts). See `references/github-actions-ci.md` for where this step sits in the
pipeline.
