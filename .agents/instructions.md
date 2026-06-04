# BreathAway Backend Coding Guidelines

These guidelines apply to all human developers and AI agents interacting with this NestJS repository. When contributing to this project, you must adhere to these rules strictly to maintain a highly scalable, secure, and maintainable codebase.

## 1. Clean Architecture & SOLID Principles

- **Clean Architecture:** We follow the NestJS modular architecture. Encapsulate related domains into highly cohesive, loosely coupled feature modules. Maintain strict boundaries:
  - **Controllers:** Handle HTTP requests and responses. Delegate business logic to services.
  - **Services:** Contain core business logic.
  - **Repositories / Database Access:** Isolate database calls within dedicated repositories or services. Never expose Prisma directly to controllers.
- **Strict Typing:** Avoid using `any` or generic `Record<string, any>` where specific types can be extracted. Rely on explicit TypeScript interfaces, classes, and Prisma-generated types.
- **SOLID Principles:** Keep functions and classes focused (Single Responsibility). Rely on abstract interfaces instead of concrete implementations for easier testing and mocking (Dependency Inversion).

## 2. Base Classes & Dependency Injection

- **Base Controller:** All controllers MUST extend `BaseController` from `@core/base`.
- **Base Service:** All services MUST extend `BaseService` from `@core/base`.
- **Logger Injection:** When extending base classes, you must inject `LoggerService` from `@core/logger` and pass it to `super()`.
  ```typescript
  import { BaseController } from '@core/base';
  import { LoggerService } from '@core/logger';

  export class ExampleController extends BaseController {
    constructor(
      loggerService: LoggerService,
      // other dependencies...
    ) {
      super(loggerService); // This initializes this.logger
    }
  }
  ```
- **Dependency Injection:** Utilize the NestJS DI container. Never use `new` to manually instantiate services.

## 3. Controllers & Modules Naming Conventions

- **Pluralization:** Modules and controllers MUST always be named using plural forms.
  - **Good:** `notifications.controller.ts`, `NotificationsController`, `notifications.module.ts`, `NotificationsModule`
  - **Bad:** `notification.controller.ts`, `NotificationController`
- **Controller Setup:** The `@Controller` decorator must include both the `path` (plural) and `version`.
  ```typescript
  @Controller({
    path: 'notifications',
    version: ['1'],
  })
  ```
- **File Naming:** Use kebab-case for files (e.g., `user-profiles.controller.ts`). Class names should be PascalCase.

## 4. DTOs (Data Transfer Objects)

- **Strict DTO Architecture:** Always use DTO classes for incoming payloads and outgoing responses.
- **Directory Structure:** Isolate DTOs into `request/` and `response/` subdirectories within the module's `dto/` folder. Use a barrel file (`index.ts`) for clean exports.
- **File Naming:**
  - Request DTOs: `[entity].request.dto.ts` (e.g., `create-user.request.dto.ts`)
  - Response DTOs: `[entity].response.dto.ts` (e.g., `user.response.dto.ts`)
- **Validation:** Implement `class-validator` and `class-transformer` decorators for strict payload validation.

## 5. Swagger API Documentation

- **Mandatory Documentation:** All APIs must have Swagger documentation in place.
- **Decorators:**
  - Controllers: `@ApiTags('Plural Entity Name')`
  - Endpoints: `@ApiOperation({ summary: '...' })`, `@ApiResponse({ status: 200, description: '...' })`
  - DTOs: Decorate all properties with `@ApiProperty()` or `@ApiPropertyOptional()`.

## 6. Global Environment & Configuration Rules

- **Environment Files (BLACKLISTED):** NEVER touch, read, modify, or write to any environment files (`.env`, `.env.local`, `.env.development`, `.env.test`, `.env.production`).
- **Secret Management:** Use the NestJS `@nestjs/config` module (`ConfigService`) exclusively to retrieve variables.
- **Prisma:** Do not execute Prisma migrations (`prisma migrate dev` or `prisma db push`) directly without explicit human approval.

## 7. Formatting & Imports

- **Prettier:** Ensure all generated code matches the standard Prettier configurations. Run `npm run format` or equivalent formatting if possible.
- **Organize Imports:**
  - Remove all unused imports.
  - Group in this strict order:
    1. Built-in Node modules
    2. External packages (e.g., `@nestjs/common`)
    3. Internal absolute path modules (e.g., `@core/...`, `@modules/...`)
    4. Local relative paths
- **Absolute Paths:** For imports traversing more than two directory levels (`../../../`), use absolute paths mapped in `tsconfig.json` (e.g., `@core/logger`, `@modules/users`).

## 8. GCP & Cloud Run Context

- **Statelessness:** Assume deployment in stateless environments like GCP Cloud Run. Do not rely on local files for persistent data.
- **Logging:** Ensure structured JSON logging via the `@core/logger`. Do not use `console.log`.
