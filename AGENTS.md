# Breathaway Backend — Agent Guidelines

These guidelines define the core architectural, coding, and workflow standards for all AI agents and developers working on the Breathaway NestJS backend.

---

## 1. Absolute Constraints & Security

- **Environment File Blacklist**: NEVER read, edit, touch, or write to any `.env*` or `env.*` files (e.g., `.env`, `.env.local`, `.env.development`, `env.dev.yaml`). All runtime configuration must be accessed strictly through NestJS `ConfigService`.
- **No Destructive Database Actions**: Never run `prisma migrate dev` or `prisma db push` directly. Always output the command for the user to execute manually.
- **Statelessness**: The application runs on GCP Cloud Run. Never store state in local filesystem memory or expect in-memory caches to persist across requests or instances.

---

## 2. Notification Architecture: Domain Events (Decoupled)

To maintain clean modular boundaries and prevent cross-cutting leakage, domain feature services must **never** be coupled to notification delivery mechanics.

### The Golden Rule

> **Domain services emit domain events. They NEVER call `NotificationsService` directly.**

### Mandatory Requirements

1. **Zero Module Import**: Do NOT import `NotificationsModule` in feature modules (`AuthModule`, `LikesModule`, `CreditsModule`, etc.).
2. **Zero Service Injection**: Do NOT inject `NotificationsService` in feature services.
3. **Zero Profile Pre-fetching for Notifications**: Do NOT query `prisma.userProfile` in a business service solely to fetch `firstName` or details for a notification payload. Recipient details are auto-resolved by the notification listener and `NotificationsService`.
4. **Emit Strongly-Typed Domain Events**: Services extending `BaseService` inherit `this.eventEmitter: EventEmitter2`. Emit strongly-typed domain events:
   ```typescript
   this.eventEmitter.emit(USER_WELCOME_EVENT, new UserWelcomeEvent(user.id));
   ```
5. **Centralized Listener**: All notification orchestration (channel selection, priority, template data, profile resolution) lives exclusively inside `NotificationEventsListener` (`src/modules/notifications/listeners/notification-events.listener.ts`) using `@OnEvent(EVENT_NAME, { async: true })`.

For full step-by-step implementation patterns and checklists, consult the `notification-events-expert` skill.

---

## 3. Code Organization & Import Conventions

Adhere strictly to the four-group import order, alphabetized within each group, with a blank line separating groups:

```typescript
// 1. Built-in Node modules
import { randomUUID } from 'crypto';

// 2. External npm packages
import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

// 3. Internal absolute path modules (from src/ or path aliases)
import { PrismaService } from '@infrastructure/database/prisma.service';
import { BaseService } from '@shared/domain/base.service';

// 4. Local relative paths (same module)
import { CreateUserRequestDto } from './dto/request/create-user.request.dto';
```

- **The Absolute Path Rule**: Any import traversing more than two directory levels up (`../../../`) MUST use absolute paths (`src/modules/...` or tsconfig path aliases `@modules/...`, `@infrastructure/...`, `@core/...`, `@common/...`).
- **Formatting**: Always format modified files using `npx prettier --write <file>`.

---

## 4. DTO Architecture & Validation

- Request DTOs: `src/modules/<feature>/dto/request/<entity>.request.dto.ts`
- Response DTOs: `src/modules/<feature>/dto/response/<entity>.response.dto.ts`
- Barrel Export: Always re-export all DTOs in `src/modules/<feature>/dto/index.ts`.
- All incoming payloads must be validated using `class-validator` and documented with `@nestjs/swagger` decorators (`@ApiProperty`, `@ApiPropertyOptional`).

---

## 5. Testing Conventions

- Every new feature, service, or event handler must include corresponding unit tests (`*.spec.ts`).
- Follow the AAA (Arrange, Act, Assert) structure.
- For services extending `BaseService`, provide `EventEmitter2` in testing modules:
  ```typescript
  { provide: EventEmitter2, useValue: { emit: jest.fn() } }
  ```
- Assert domain event emissions instead of notification deliveries:
  ```typescript
  expect(eventEmitter.emit).toHaveBeenCalledWith(
    CREDITS_PURCHASED_EVENT,
    expect.objectContaining({ userId, amount: 10 }),
  );
  ```
