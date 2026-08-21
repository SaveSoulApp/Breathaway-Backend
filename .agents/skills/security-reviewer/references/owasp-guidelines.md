# OWASP Guidelines — Input Validation & Injection Prevention

Reference for input validation, injection prevention, and OWASP Top 10 (2021) coverage
in a NestJS + Prisma + PostgreSQL backend on GCP.

---

## 1. Global Validation Pipe (mandatory baseline)

Every NestJS app in this project must have this exact configuration in `main.ts`:

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // strip properties not in the DTO — prevents mass assignment
    forbidNonWhitelisted: true, // reject (don't silently strip) unexpected properties
    transform: true, // auto-transform payloads to DTO instances/types
    transformOptions: { enableImplicitConversion: true },
    forbidUnknownValues: true,
  }),
);
```

**Why each flag matters:**

- `whitelist: true` alone strips unknown fields silently — combine with `forbidNonWhitelisted`
  to actively reject requests trying to inject unexpected fields (e.g., a client sending
  `{ "role": "ADMIN" }` in a signup payload).
- `transform: true` ensures `@IsInt()` on a query param actually works — without it, query
  params arrive as strings and validators silently no-op.

---

## 2. DTO Validation Patterns

Every DTO property must have an explicit `class-validator` decorator. No exceptions for
"internal" or "trusted" endpoints — trust nothing that crosses the HTTP boundary.

```typescript
export class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt has a 72-byte limit — cap input accordingly
  @Matches(/^(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password needs an uppercase letter and a number',
  })
  password: string;

  @IsString()
  @MaxLength(100)
  @Matches(/^[\p{L}\s'-]+$/u, { message: 'Name contains invalid characters' })
  name: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
```

**Rules:**

- Always pair type validators (`@IsString`, `@IsInt`) with bounds (`@MaxLength`, `@Min`, `@Max`)
  — an unbounded string field is a DoS and storage-abuse vector.
- Use `@IsEnum()` for any field with a fixed set of valid values — never `@IsString()` alone
  for status/role/type fields.
- Use `@IsUUID()` for all ID fields received from the client (path params, body references).
- Never accept `@IsObject()` or untyped nested objects — always define a nested DTO class with
  `@ValidateNested()` and `@Type(() => NestedDto)`.

```typescript
export class CreateOrderDto {
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  lines: OrderLineDto[];
}
```

---

## 3. Injection Prevention

### SQL Injection (Prisma)

Prisma's query builder parameterizes queries automatically — standard `findMany`, `create`,
`update` calls are safe by default.

**Flag immediately:**

```typescript
// ❌ Raw SQL with string interpolation — SQL injection
await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${email}'`);

// ❌ Even $queryRaw is unsafe if interpolated instead of parameterized
await prisma.$queryRaw(`SELECT * FROM users WHERE email = '${email}'`);
```

**Required pattern if raw SQL is truly necessary:**

```typescript
// ✅ Parameterized — Prisma escapes values automatically
await prisma.$queryRaw`SELECT * FROM users WHERE email = ${email}`;
```

Prefer the query builder over raw SQL whenever the query can be expressed that way. Raw SQL
should be a documented exception (e.g., complex aggregation), not a default tool.

### NoSQL-style Injection via JSON fields

If any Prisma model uses a `Json` field, validate its shape with a DTO/schema before writing —
never pass client-supplied JSON straight into a `Json` column unvalidated, since it can later
be queried or rendered in ways that assume a trusted shape.

### Command Injection

Never pass user input into `child_process.exec()` or shell-interpolated commands. If shelling
out is unavoidable, use `execFile()` with an argument array (not a concatenated string) so the
shell never re-interprets user input.

---

## 4. Cross-Site Scripting (XSS)

The API itself doesn't render HTML, but it's the boundary that determines what gets stored
and later rendered by the frontend.

- Treat all user-supplied strings (names, bios, comments, titles) as untrusted on **output**,
  not just input — the frontend is responsible for escaping on render, but flag if no
  sanitization exists anywhere in the pipeline for rich-text fields.
- For any field that accepts HTML/markdown intentionally (e.g., a rich-text bio), sanitize
  server-side with a library like `sanitize-html` before persisting, using an explicit allowlist
  of tags/attributes — never a denylist.
- Set `Content-Type: application/json` explicitly on all API responses so browsers never
  MIME-sniff a JSON response as HTML.

---

## 5. IDOR (Insecure Direct Object Reference)

The single most common real-world vulnerability in CRUD APIs. Every `:id`-scoped endpoint
needs an explicit ownership/permission check — existence in the database is not authorization.

```typescript
// ❌ IDOR — any authenticated user can fetch any order by guessing/incrementing IDs
@Get(':id')
async getOrder(@Param('id') id: string) {
  return this.getOrderUseCase.execute(id);
}

// ✅ Correct — ownership checked against the authenticated user
@Get(':id')
async getOrder(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
  return this.getOrderUseCase.execute(id, req.user.uid);
}

// inside the use case
async execute(orderId: string, requesterId: string): Promise<Order> {
  const order = await this.orderRepository.findById(orderId);
  if (!order) throw new OrderNotFoundException(orderId);
  if (order.userId !== requesterId && !this.isAdmin(requesterId)) {
    throw new ForbiddenException();
  }
  return order;
}
```

Apply this check in the use case (application layer), not the controller — keeps it testable
and ensures it's enforced regardless of which controller calls the use case.

---

## 6. Rate Limiting & Brute Force Protection

```typescript
// app.module.ts
ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),  // global default

// Stricter on auth endpoints
@Throttle({ default: { limit: 5, ttl: 60000 } })
@Public()
@Post('login')
async login(@Body() dto: LoginDto) { ... }
```

- Apply tighter limits on: login, password reset request, signup, OTP verification.
- Use a distributed throttler store (Redis) if running multiple Cloud Run instances —
  in-memory throttling resets per-instance and is trivially bypassed behind a load balancer.

---

## 7. Security Headers

```typescript
app.use(helmet());
```

Verify Helmet's defaults are not disabled. At minimum confirm these are active:

- `Strict-Transport-Security` (HSTS) — enforced additionally at the GCP Load Balancer level
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy` — configure explicitly rather than relying on Helmet's default if
  the API serves any HTML (e.g., Swagger UI in non-prod environments only)

---

## 8. CORS

```typescript
app.enableCors({
  origin: configService.getOrThrow<string>('ALLOWED_ORIGINS').split(','), // explicit allowlist
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
});
```

- Never use `origin: '*'` on any API that accepts authenticated requests or cookies.
- Maintain the allowlist via environment config (sourced from Secret Manager or GCP env vars
  per environment), not hardcoded in source.

---

## 9. Sensitive Data Exposure

- Audit every `ResponseDto` to confirm it excludes: password hashes, internal Firebase UID
  if not needed by the client, internal feature flags, raw Prisma relation objects.
- Audit logging statements for accidental inclusion of full request bodies, headers
  (especially `Authorization`), or full user objects.
- In production (`NODE_ENV=production`), ensure the global exception filter strips stack
  traces and raw Prisma error messages from the response body — return a generic message
  and log the detail server-side only (Cloud Logging).

```typescript
// global-exception.filter.ts
catch(exception: unknown, host: ArgumentsHost) {
  const isProd = this.configService.get('NODE_ENV') === 'production';
  const message = isProd && !(exception instanceof HttpException)
    ? 'Internal server error'
    : exception.message;
  // log full detail server-side regardless of environment
  this.logger.error(exception);
  // respond with sanitized message only
}
```

---

## 10. Dependency & Supply Chain

- Run `npm audit` (or a GCP-integrated equivalent like Artifact Registry vulnerability
  scanning) as part of CI — flag any high/critical findings before merge.
- Pin dependency versions for security-critical packages (`firebase-admin`, `bcrypt`,
  `class-validator`, `helmet`) rather than using loose semver ranges.

---

## OWASP Top 10 (2021) Quick Cross-Reference

| OWASP Category                         | Where covered in this doc                                                                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A01 Broken Access Control              | Sections 5 (IDOR), see also `firebase-auth.md` sections 3–4                                                                                                                                                                                                  |
| A02 Cryptographic Failures             | Section 9 (sensitive data), `firebase-auth.md` token handling                                                                                                                                                                                                |
| A03 Injection                          | Section 3                                                                                                                                                                                                                                                    |
| A04 Insecure Design                    | Cross-reference `clean-architecture-expert` skill                                                                                                                                                                                                            |
| A05 Security Misconfiguration          | Sections 7, 8                                                                                                                                                                                                                                                |
| A06 Vulnerable Components              | Section 10                                                                                                                                                                                                                                                   |
| A07 Identification & Auth Failures     | `firebase-auth.md` (full file)                                                                                                                                                                                                                               |
| A08 Software/Data Integrity Failures   | Section 3 (JSON field validation)                                                                                                                                                                                                                            |
| A09 Logging & Monitoring Failures      | Section 9 (logging discipline)                                                                                                                                                                                                                               |
| A10 Server-Side Request Forgery (SSRF) | Validate and allowlist any server-side outbound URL fetch (e.g., webhook URLs, avatar URLs) — never fetch a client-supplied URL without an allowlist or at minimum blocking internal/metadata IP ranges (`169.254.169.254` GCP metadata endpoint especially) |
