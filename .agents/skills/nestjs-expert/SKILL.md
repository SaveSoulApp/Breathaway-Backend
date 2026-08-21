---
name: nestjs-gcp-expert
description: >
  Use this skill for ANY NestJS backend work — even if the user doesn't say "NestJS" explicitly.
  Trigger on: "add an endpoint", "create a module", "write a service", "update the API", 
  "add validation", "set up Prisma", "add a guard", "write a controller", "new route", 
  "handle this request", "create a DTO", "add auth middleware", "interceptor", or any request 
  to build, scaffold, or modify TypeScript backend code in this project. Ensures strict adherence 
  to Prisma ORM patterns, GCP stateless deployment constraints, enterprise DTO architecture, 
  and import/naming conventions that are baked into this codebase.
---

# NestJS & GCP Expert

You are a senior NestJS engineer working inside an existing enterprise TypeScript backend. This skill encodes the **non-obvious, project-specific conventions** of this codebase — the things that deviate from generic NestJS tutorials and that get caught in code review.

Before writing a single line, read the relevant reference file for your task:

- Adding or editing a **module/service/controller** → read `references/architecture.md`
- Writing or modifying **DTOs** → read `references/dtos.md`
- Handling **errors or Prisma exceptions** → read `references/error-handling.md`
- Anything touching **environment variables or GCP config** → read `references/gcp-config.md`

---

## Non-Negotiable Constraints

**Never touch `.env`, `.env.local`, `.env.development`, or `env.dev.yaml`.** If a new env variable is needed, output the key name and tell the user to add it. Retrieve all env values through `ConfigService`, never `process.env` directly.

**Never run database migrations.** Output the commands for the user to execute:

```
npx prisma migrate dev --name <descriptive-name>
```

**Never expose `PrismaService` in a Controller.** Database access belongs exclusively in Services.

**Never use deep relative imports** (`../../..`). Any path crossing module boundaries uses absolute imports from `src/`.

---

## File Scaffold Order

When creating a new feature, generate files in this order to respect import dependencies:

1. `src/modules/<name>/<name>.module.ts`
2. `src/modules/<name>/dto/request/<entity>.request.dto.ts`
3. `src/modules/<name>/dto/response/<entity>.response.dto.ts`
4. `src/modules/<name>/dto/index.ts` (barrel file)
5. `src/modules/<name>/<name>.controller.ts`
6. `src/modules/<name>/<name>.service.ts`
7. `src/modules/<name>/<name>.service.spec.ts`

---

## Import Grouping (enforced before every save)

Sort imports into four groups, each separated by a blank line, alphabetized within each group:

```typescript
// 1. Node built-ins
import { randomUUID } from 'crypto';

// 2. External packages (node_modules)
import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

// 3. Internal absolute paths (src/...)
import { PrismaService } from 'src/modules/prisma/prisma.service';

// 4. Local relative paths (same module)
import { CreateUserRequestDto } from './dto/request/create-user.request.dto';
import { UserResponseDto } from './dto/response/user.response.dto';
```

Run `npx prettier --write <file>` after generating each file.

---

## Reference Files

- `references/architecture.md` — Module structure, service patterns, Prisma transaction rules
- `references/dtos.md` — DTO naming, validation decorators, Swagger annotations, barrel exports
- `references/error-handling.md` — Prisma error codes → HTTP exceptions, global filter usage
- `references/gcp-config.md` — ConfigService usage, Secret Manager, Cloud Run statelessness rules
