---
description: Resolves findings from an AI review (Potential Bugs, Security Concerns, Performance Concerns, Maintainability, and Suggested Improvements)
---

# Resolve AI Review Findings Workflow

**Objective:** Systematically work through all review findings identified in an AI code review (or `/ai-review`), addressing **Potential Bugs**, **Security Concerns**, **Performance Concerns**, **Maintainability issues**, and implementing **Suggested Improvements** while strictly maintaining repository architecture, security, and quality standards.

---

## Slash Commands & Triggering

This workflow is invoked with:

- `/resolve-review`
- `/fix-review`
- _"Lets work on the suggested improvement to solve the Potential bugs, Security Concerns, Performance Concerns and Maintainability"_
- _"Fix the issues identified in the AI review"_
- _"Apply review findings"_

---

## Non-Negotiable Architectural & Security Constraints

Before modifying any files, verify and uphold all project invariants:

1. **Environment File Blacklist**: NEVER read, edit, touch, create, or commit `.env`, `.env.local`, `.env.development`, or `env.dev.yaml`. All configuration must use NestJS `ConfigService`.
2. **No Destructive Database Actions**: NEVER execute `prisma migrate dev` or `prisma db push` directly. If schema alterations are required, output the exact command for the user to execute manually.
3. **Decoupled Notifications Golden Rule**:
   - Feature services must **never** import `NotificationsModule`.
   - Feature services must **never** inject `NotificationsService`.
   - Feature services must **never** query `prisma.userProfile` solely to fetch recipient names for notifications.
   - Domain actions must emit strongly-typed domain events via `EventEmitter2` (inherited from `BaseService`).
4. **External HTTP Communication**: NEVER import or call `axios` directly. Inject and use `HttpClientService` from `@infrastructure/http`.
5. **Code Formatting & 4-Group Import Standard**:
   - Every modified TypeScript file must enforce the strict 4-group import order (alphabetized within each group, separated by blank lines):
     1. Built-in Node modules (e.g. `crypto`, `path`)
     2. External npm packages (e.g. `@nestjs/common`, `@prisma/client`)
     3. Internal absolute path modules (`@modules/...`, `@infrastructure/...`, `@core/...`, `@common/...`, `@shared/...`)
     4. Local relative paths (`./dto/...`, `./entities/...`)
   - **Absolute Path Rule**: Any import traversing more than two directory levels up (`../../../`) MUST use absolute path aliases.
   - Run `npx prettier --write <file>` on every modified file.
6. **Iteration Budget**: Apply a maximum of **3 iterative repair cycles** for fixing compile/lint/test issues. If blockers remain after 3 cycles, halt and ask for user clarification.

---

## Step-by-Step Execution Protocol

Execute the following phases in order:

### Phase 1: Ingest & Parse Review Findings

Identify the review findings from available sources in this priority order:

1. **Active Conversation Context**: Check the current conversation turn for the most recent `/ai-review` output under the standard headers:
   - `## Potential Bugs`
   - `## Security Concerns`
   - `## Performance Concerns`
   - `## Maintainability`
   - `## Suggested Improvements`
2. **Review Output File**: If not in chat context, check for `.agents/review.md` or recent review artifacts.
3. **Branch Diff Inspection**: If no explicit review is present, inspect changes against develop using:
   ```bash
   .agents/skills/ai-review/scripts/extract-pr-diff.sh --base origin/develop --stat
   ```
4. **User-Provided Feedback**: If the user pasted specific review comments or PR feedback, parse those items.

---

### Phase 2: Formulate Prioritized Remediation Plan

Itemize every finding and group them in strict priority order (highest risk first):

1. 🚨 **Priority 1: Security Concerns**
   - Missing authentication guards (`@UseGuards(FirebaseAuthGuard)` vs `@Public()`)
   - IDOR vulnerabilities / missing resource ownership validation (`req.user.userId === resource.userId`)
   - Unsanitized inputs or SQL injection vectors
   - Hardcoded secrets or sensitive data exposure in logs
2. 🐛 **Priority 2: Potential Bugs**
   - Logic errors, off-by-one errors, regex traps, unhandled edge cases
   - Missing null/undefined checks and unhandled promise rejections
   - Flawed state transitions or race conditions
3. ⚡ **Priority 3: Performance Concerns**
   - N+1 database queries (replace in-loop queries with batching or nested `select`/`include`)
   - Missing multi-step write transactions (`this.prisma.$transaction(...)`)
   - Unindexed query filters or heavy unbounded lookups
4. 🧹 **Priority 4: Maintainability & Suggested Improvements**
   - Import order (4 groups) and absolute path violations (`../../../`)
   - Direct `NotificationsService` usage (refactor to domain events)
   - DTO request/response isolation (`dto/request/` and `dto/response/`) with `class-validator` and `@ApiProperty`
   - Code duplication, dead code, or confusing variable naming

Present the categorized checklist to the user before or alongside code modifications.

---

### Phase 3: Implement Fixes Systematically

For each item in the remediation plan:

1. **Context Inspection**: Read the target file and its surrounding modules/types to understand complete context.
2. **Apply Minimal & Robust Changes**: Make precise edits using drop-in replacements. Maintain all unrelated comments and docstrings.
3. **Adhere to Domain Boundaries**:
   - In Services: Delegate DB calls to Prisma, emit domain events for side-effects.
   - In Controllers: Handle HTTP mapping only, delegate business logic to Services.
   - In DTOs: Decorate with `class-validator` and `@nestjs/swagger`.
4. **Apply Formatting**:
   ```bash
   npx prettier --write <path-to-modified-file>
   ```

---

### Phase 4: Update & Run Unit Tests

For every service, controller, or helper modified:

1. Locate or create the corresponding spec file (`<file>.spec.ts`).
2. Add or update unit tests covering:
   - The bug fix or edge case addressed.
   - Security permission / authorization checks.
   - Domain event emissions (assert `eventEmitter.emit` with `expect.objectContaining(...)`).
3. Follow the AAA (Arrange, Act, Assert) structure.
4. Provide proper mock providers in test modules:
   - `EventEmitter2`: `{ provide: EventEmitter2, useValue: { emit: jest.fn() } }`
   - `HttpClientService`: `{ provide: HttpClientService, useValue: { get: jest.fn(), post: jest.fn() } }` (Never mock `axios` directly).
5. Run the affected unit tests:
   ```bash
   pnpm exec jest <path-to-spec>
   ```

---

### Phase 5: Verification & CI Quality Gates

Validate that the changes pass all repository quality checks:

1. **TypeScript Type-Check**:
   ```bash
   pnpm exec tsc --noEmit
   ```
2. **ESLint & Code Style**:
   ```bash
   pnpm lint
   ```
   _(If lint errors occur, fix them immediately. Max 3 iterations)._
3. **Full / Relevant Test Suite**:
   ```bash
   pnpm exec jest --passWithNoTests
   ```

---

### Phase 6: Final Summary & Hand-off

Output a structured markdown report summarizing the work:

1. **Remediation Summary Table**:
   | Category | Original Finding | Solution Implemented | Files Modified |
   | :--- | :--- | :--- | :--- |
   | 🚨 Security | ... | ... | `[file.ts](file:///...)` |
   | 🐛 Bug | ... | ... | `[file.ts](file:///...)` |
   | ⚡ Performance | ... | ... | `[file.ts](file:///...)` |
   | 🧹 Maintainability | ... | ... | `[file.ts](file:///...)` |

2. **Verification Status**:
   - Prettier formatting: Passed
   - ESLint: Passed
   - `tsc --noEmit`: Passed
   - Jest tests: Passed

3. **Next Steps Guidance**:
   - Recommend running `/prepare-for-pull-request` to execute the full CI quality pipeline before committing and pushing.
