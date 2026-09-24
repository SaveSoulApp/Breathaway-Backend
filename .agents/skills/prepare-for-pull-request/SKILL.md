---
name: prepare-for-pull-request
description: >-
  Prepares a branch for pull request by verifying and enforcing all CI quality gates from
  .github/workflows/tests.yaml. Runs and fixes Prisma generation, Prettier formatting,
  import organization, ESLint rules, TypeScript type-checking (tsc --noEmit), Jest unit tests,
  and git cleanliness. Trigger when the user runs "/prepare-for-pull-request", asks to prepare a PR,
  verifies CI readiness, or asks if changes are ready to push/merge.
---

# Prepare for Pull Request (CI Quality Gate Runner)

This skill automates the full local quality-gate verification process to guarantee that code pushed to GitHub passes the GitHub Actions CI pipeline defined in [tests.yaml](file:///.github/workflows/tests.yaml) on the first run.

---

## CI Pipeline Mapping

The GitHub Actions CI job (`ci` in `.github/workflows/tests.yaml`) runs the following steps. This skill replicates and validates each gate locally:

| # | CI Step Name | Exact CI Command | Local Gate & Agent Action |
| :- | :--- | :--- | :--- |
| **1** | Toolchain & Deps | `pnpm install --frozen-lockfile` | Verify `pnpm` is available and dependencies are installed |
| **2** | Generate Prisma Client | `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci pnpm exec prisma generate` | Regenerate Prisma client with dummy DSN to satisfy eager config loading |
| **3** | Prettier / Imports | Embedded in `pnpm lint` (`prettier/prettier` error) | Organize imports (4 groups), enforce absolute paths, run Prettier |
| **4** | Lint | `pnpm lint` | Run ESLint with `--fix`, diagnose & fix remaining lint violations |
| **5** | Type-check | `pnpm exec tsc --noEmit` | Strict TypeScript compiler check across whole workspace |
| **6** | Tests & Coverage | `pnpm exec jest --coverage --ci --passWithNoTests` | Run unit test suite, verify test assertions & coverage report |
| **7** | Working Tree & PR | Working tree cleanliness & PR summary | Verify git status, suggest conventional commit & PR description |

---

## Security & Architecture Constraints

Before executing any commands, strictly uphold these non-negotiable rules:

1. **Environment File Blacklist**: NEVER read, edit, touch, commit, or mention secrets from `.env`, `.env.local`, `.env.development`, `.env.test`, or `env.dev.yaml`.
2. **No Destructive Database Actions**: Do NOT execute `prisma migrate dev` or `prisma db push`. If schema changes are detected, output the command for the user to run manually.
3. **Decoupled Notifications**: Ensure feature services emit domain events via `EventEmitter2` and never import `NotificationsModule` or `NotificationsService` directly.
4. **Strict Import Rules**:
   - 4-group order: 1) Built-in Node, 2) External npm packages, 3) Internal absolute path modules, 4) Local relative paths.
   - Traversing > 2 directory levels (`../../../`) must use absolute paths (`@modules/...`, `@infrastructure/...`, etc.).
5. **Iteration Limit**: Maximum **3 iterative repair cycles** for fixing lint/type errors. If errors persist after 3 cycles, halt and ask for user clarification.

---

## Step-by-Step Execution Protocol

Execute these steps in order. Stop and fix issues before advancing to subsequent gates.

### Step 0: Pre-flight & Git Status Audit

Check the status of uncommitted, modified, and untracked files:

```bash
git status -s
```

- Confirm no blacklist files (`.env*`) are modified or staged.
- Identify the set of modified `.ts` files that will need formatting and review.

---

### Step 1: Generate Prisma Client

`prisma.config.ts` eagerly validates `DATABASE_URL` at load time even for `generate`. Provide the CI fallback DSN:

```bash
DATABASE_URL="postgresql://ci:ci@localhost:5432/ci" pnpm exec prisma generate
```

- **If it fails**: Inspect `prisma/schema.prisma` for syntax errors or missing relation fields.
- Fix syntax errors in `prisma/schema.prisma` if any were introduced, then re-run generation.

---

### Step 2: Code Formatting & Import Organization

In this project, ESLint runs `eslint-plugin-prettier/recommended` with `prettier/prettier: ['error', { endOfLine: 'auto' }]`. Any formatting discrepancy will break CI linting.

1. **Organize Imports** on modified files according to the 4-group hierarchy:
   ```typescript
   // 1. Built-in Node modules
   import { randomUUID } from 'crypto';

   // 2. External packages
   import { Injectable, NotFoundException } from '@nestjs/common';
   import { EventEmitter2 } from '@nestjs/event-emitter';

   // 3. Internal absolute path modules
   import { PrismaService } from '@infrastructure/database/prisma.service';
   import { BaseService } from '@shared/domain/base.service';

   // 4. Local relative paths
   import { CreateUserRequestDto } from './dto/request/create-user.request.dto';
   ```
2. **Run Prettier**:
   ```bash
   npx prettier --write "src/**/*.ts" "test/**/*.ts"
   ```
   *(Or target specific modified files for faster execution).*

---

### Step 3: Run ESLint (`pnpm lint`)

Run the project linter:

```bash
pnpm lint
```

If ESLint reports errors, analyze and fix them autonomously:

- **Unused variables (`@typescript-eslint/no-unused-vars`)**:
  Remove unused variables or prefix unused parameters with an underscore `_` (e.g., `_req`, `_event`).
- **Missing log step (`local/no-missing-log-step`)**:
  In `*.service.ts`, every `logger.log/warn/error` call must include a `step` property in the metadata object:
  ```typescript
  this.logger.log('User registered successfully', { step: 'registration_complete', userId: user.id });
  ```
- **Misused promises (`@typescript-eslint/no-misused-promises`)**:
  In test files or callbacks expecting `void`, ensure promises are awaited or passed to an `async` function handler.
- **Unsafe assignments/members (`@typescript-eslint/no-unsafe-*`)**:
  Provide explicit type annotations and avoid raw `any` types.

Re-run `pnpm lint` after edits until it passes with **0 errors**.

---

### Step 4: Strict Type-Check (`tsc --noEmit`)

Run the TypeScript compiler to ensure 100% type safety across the entire application:

```bash
pnpm exec tsc --noEmit
```

- **If errors are found**: Trace the exact file, line number, and TypeScript error code (e.g., `TS2345`, `TS2322`).
- Inspect the interface/DTO/model definition and fix type incompatibilities.
- Ensure strict null-checks and proper return types.
- Re-run `pnpm exec tsc --noEmit` until the output is clean (exit code 0).

---

### Step 5: Unit Tests & Coverage (`jest`)

Run the unit test suite matching CI invocation:

```bash
pnpm exec jest --coverage --ci --passWithNoTests
```

*(Tip: To test modified modules first during iterative fixes: `pnpm exec jest <path/to/spec.ts>`)*

- **Analyze Failures**:
  - If an assertion fails, compare expected vs. actual output and update the test mock or implementation.
  - If a test expects domain event emissions, verify `expect(eventEmitter.emit).toHaveBeenCalledWith(...)`.
  - **Sandbox Notice**: If running inside a sandboxed environment where local loopback TCP port binding is restricted (`connect EPERM 127.0.0.1`), unit tests using mocked dependencies will pass cleanly, whereas e2e tests spinning up actual HTTP listeners require unsandboxed execution or CI execution.

---

### Step 6: PR Readiness Summary & Git Recommendations

Once all gates pass, inspect `git status` and output a clean **PR Readiness Dashboard**:

```markdown
### 🚀 CI Readiness Dashboard

| Quality Gate | CI Equivalent | Status | Details |
| :--- | :--- | :---: | :--- |
| **Prisma Generation** | `prisma generate` | ✅ PASS | Prisma client synchronized |
| **Formatting & Imports** | `prettier --write` | ✅ PASS | 4-group import order & Prettier verified |
| **ESLint Quality** | `pnpm lint` | ✅ PASS | 0 errors, 0 warnings |
| **TypeScript Type-Check**| `tsc --noEmit` | ✅ PASS | Workspace compiles cleanly |
| **Jest Unit Tests** | `jest --coverage --ci` | ✅ PASS | All unit tests passing |
| **Working Tree** | `git status` | ✅ PASS | No secret leaks, ready for commit |

---

### 📝 Suggested Commit & Pull Request Template

**Suggested Branch Name**: `feat/<short-topic>` or `fix/<short-topic>`
**Suggested Commit Message**:
```
<type>(<scope>): <concise description of changes>
```

**Pull Request Title**: `<type>(<scope>): <concise description>`

**Pull Request Description**:
```markdown
## Summary
- <bullet points explaining WHAT changed and WHY>

## CI Quality Gates Verified Locally
- [x] Prisma Client generated successfully
- [x] Prettier & Import ordering enforced
- [x] ESLint passed with 0 errors (`pnpm lint`)
- [x] TypeScript compiled cleanly (`tsc --noEmit`)
- [x] Unit tests passing with coverage (`jest`)
```
```

---

## One-Shot Script Alternative

Developers and the agent can also execute the automated all-in-one runner script:

```bash
.agents/skills/prepare-for-pull-request/scripts/run-ci-checks.sh --fix
```

Options:
- `-f, --fix`: Automatically runs Prettier and auto-fixes ESLint rules before testing.
- `-q, --quick`: Skips long unit test runs and runs Prisma generate, ESLint, and `tsc --noEmit`.
- `-t, --tests-only`: Runs only the Jest test suite.
