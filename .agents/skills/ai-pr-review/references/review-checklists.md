# AI PR Review — Engineering Checklists & Rules Reference

This document details the exact evaluation criteria used by the local model when conducting an AI PR Review in this repository, mirroring and extending [.github/workflows/ai-pr-review.yml](file:///.github/workflows/ai-pr-review.yml).

---

## 1. NestJS Architecture & Dependency Injection

- [ ] **Dependency Injection (DI)**: Services and repositories must be injected via constructors using NestJS DI. Never instantiate services with `new` inside providers or controllers.
- [ ] **Module Boundaries**: Modules must be cohesive and loosely coupled. Feature services must not import foreign feature modules unless strictly necessary and exported properly.
- [ ] **Circular Dependencies**: Look out for circular imports. If necessary, use `forwardRef(() => ...)` and evaluate whether architectural decoupling (such as domain events) is cleaner.
- [ ] **Singletons vs Scopes**: Services should remain default singleton scope unless request-scoped context (e.g. `nestjs-cls`) is explicitly needed.

---

## 2. Decoupled Notifications Architecture (Golden Rule)

As specified in `AGENTS.md`:

> **Domain services emit domain events. They NEVER call `NotificationsService` directly.**

- [ ] **Zero Module Import**: Feature modules (`AuthModule`, `LikesModule`, `CreditsModule`, `SubscriptionsModule`, etc.) must **never** import `NotificationsModule`.
- [ ] **Zero Service Injection**: Feature services must **never** inject `NotificationsService`.
- [ ] **Zero Profile Pre-fetching for Notifications**: Services must not query `prisma.userProfile` solely to fetch recipient names/emails for notifications. Recipient details are auto-resolved by `NotificationEventsListener`.
- [ ] **Domain Event Emission**: Services extending `BaseService` inherit `this.eventEmitter: EventEmitter2`. Verify that actions emit strongly typed domain events (e.g., `this.eventEmitter.emit(EVENT_NAME, new SpecificEvent(...))`).

---

## 3. Prisma ORM & Database Performance

- [ ] **N+1 Query Prevention**: Never execute Prisma queries inside loops (`for`, `map`, `forEach`, `Promise.all` over collections). Relations must be eagerly loaded using nested `select` or `include` in the parent query.
- [ ] **Selective Querying (`select` vs `include`)**: Prefer `select` over `include` when fetching records, selecting only the necessary columns to minimize wire overhead and memory usage.
- [ ] **Multi-step Write Transactions**: Any interdependent write operations (e.g., creating a record and debiting credits, or updating status and inserting an audit log) MUST be wrapped in `await this.prisma.$transaction([...])` or interactive `$transaction(async (tx) => ...)`.
- [ ] **Missing Database Indexes**: If a query filters (`where`) or joins on non-primary fields, verify that PostgreSQL indexes (`@@index`) exist in `prisma/schema.prisma`.
- [ ] **No Destructive Database Changes**: Ensure no PR runs or suggests unchecked destructive operations on production tables.

---

## 4. DTO Architecture & Input Validation

- [ ] **Directory Structure**:
  - Request DTOs: `src/modules/<feature>/dto/request/<entity>.request.dto.ts`
  - Response DTOs: `src/modules/<feature>/dto/response/<entity>.response.dto.ts`
  - Re-exported via `src/modules/<feature>/dto/index.ts`
- [ ] **Strict Validation**: Every property in request DTOs must have explicit `class-validator` decorators (`@IsString()`, `@IsUUID()`, `@IsEnum()`, `@IsOptional()`, etc.).
- [ ] **Swagger Documentation**: Every DTO property must have `@ApiProperty()` or `@ApiPropertyOptional()` with description and example.
- [ ] **Mass Assignment Protection**: Rely on the global `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true`.

---

## 5. Security & AppSec

- [ ] **Environment File Blacklist**: Strictly ensure `.env`, `.env.local`, `.env.development`, and `env.dev.yaml` are never committed, modified, or logged.
- [ ] **Authentication**: Protected routes must enforce `@UseGuards(FirebaseAuthGuard)` or equivalent. Public endpoints must be explicitly annotated with `@Public()`.
- [ ] **Authorization & IDOR**: Verify that users can only access their own resources (e.g. checking `userId` from auth token against resource owner, not relying purely on query parameters from the client).
- [ ] **Input Sanitization**: No raw string interpolation into database queries (`$queryRawUnsafe` without parameterized values).

---

## 6. Observability & Logging Discipline

- [ ] **Structured Logging**: Use the project's plain-Pino `LoggerService`.
- [ ] **Mandatory Step Property**: In `*.service.ts`, every `logger.log/warn/error` call must include a `step` property in the metadata object:
  ```typescript
  this.logger.log('Operation completed', { step: 'operation_completed', userId: user.id });
  ```
- [ ] **Error Serialization**: Catch blocks should log errors using structured error helpers or include `{ err: error.message, stack: error.stack }`. Never swallow errors silently.

---

## 7. Import Organization & Code Style

- [ ] **4-Group Import Hierarchy**:
  1. Built-in Node modules (e.g., `crypto`, `path`)
  2. External npm packages (e.g., `@nestjs/common`, `class-validator`)
  3. Internal absolute path modules (`@infrastructure/...`, `@modules/...`, `@shared/...`)
  4. Local relative paths (`./dto/...`)
- [ ] **Absolute Path Rule**: Any import traversing more than two directory levels up (`../../../`) must use absolute paths (`@modules/...` or `src/...`).
- [ ] **Naming Conventions**: Kebab-case files (`*.controller.ts`, `*.service.ts`, `*.request.dto.ts`), PascalCase classes, camelCase methods/variables, UPPER_SNAKE_CASE constants.

---

## 8. Mermaid Diagram Guidelines

- Diagrams must be rendered in valid Mermaid syntax inside ````mermaid` fenced code blocks.
- Supported types:
  - `graph TD` (Top-down workflow or architecture)
  - `sequenceDiagram` (Request/response lifecycle or domain event flow)
- Quote node labels containing brackets, parentheses, or special characters:
  ```mermaid
  graph TD
    Client["Client App"] --> Controller["SubscriptionsController"]
    Controller --> Service["SubscriptionsService"]
    Service --> Event["EventEmitter2.emit('subscription.created')"]
  ```
- Do not use unsupported diagram types.
