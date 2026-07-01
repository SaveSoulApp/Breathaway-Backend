---
name: test-automation-expert
description: >
  Use this skill to generate and review unit tests and E2E tests for a NestJS + Prisma +
  PostgreSQL backend, following this project's established testing conventions (Jest,
  Supertest, the shared PrismaService mock factory, LoggerService.forContext, nestjs-cls,
  and the AAA test structure).
  Trigger on: "write tests", "generate unit test", "E2E test", "test coverage", "mock prisma",
  "test this service", "test this controller", "add test cases", "edge cases", "test the guard".
  Also trigger whenever a new service, controller, guard, or use case is created or modified —
  even if the user doesn't explicitly ask for tests — since every unit of business logic in
  this project ships with a corresponding spec file.
---

# Test Automation Specialist

You are a QA automation engineer ensuring high test coverage and robust testing practices in
Jest and Supertest, following this project's established conventions exactly — not generic
NestJS testing boilerplate.

Before writing tests, load the relevant reference files:
- `references/mocking-strategy.md` — How to mock `PrismaService`, `LoggerService`, `ClsService`,
  `EventEmitter2`, and other project-standard injected dependencies.
- `references/e2e-testing.md` — Structuring Supertest E2E specs against the full HTTP lifecycle.

Load **both** for a new feature's full test suite (unit + E2E). Load only `mocking-strategy.md`
for a single service/controller unit test task.

---

## Project Testing Conventions (non-negotiable — match exactly)

These conventions were extracted from this codebase's existing specs. Every new test must
follow them, not generic Jest/NestJS patterns found elsewhere.

### 1. Standard Provider Mock Set
Almost every service and controller test module needs this baseline set of mocked providers,
even if the unit under test doesn't obviously touch all of them — they're part of the DI graph
via shared modules/interceptors:

```typescript
providers: [
  { provide: ClsService, useValue: { get: jest.fn() } },
  { provide: EventEmitter2, useValue: { emit: jest.fn() } },
  { provide: PrismaService, useValue: createPrismaMock() },
  { provide: LoggerService, useValue: loggerServiceMock },
  YourServiceUnderTest,
]
```

### 2. LoggerService Mock Pattern
`LoggerService` is never injected as a flat logger — it's always accessed via `.forContext(name)`,
which returns the actual logger interface. Mock it accordingly:

```typescript
const loggerServiceMock = {
  forContext: jest.fn().mockReturnValue({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  }),
} as unknown as jest.Mocked<LoggerService>;
```
Assert against it via the same chain: `loggerServiceMock.forContext('ServiceName').error`.

### 3. PrismaService Mock — always the shared factory
Never hand-roll a Prisma mock with `jest-mock-extended` inline in a spec file. Always import
the shared factory:

```typescript
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';

let prisma: MockPrismaService;
// ...
prisma = module.get(PrismaService);
```
This keeps Prisma client typing consistent across the whole test suite and avoids each spec
file reinventing the mock shape. See `references/mocking-strategy.md` for the factory's
internals and how to extend it for a new model.

### 4. DateUtil, not raw Date
Never use `new Date()` or `Date.now()` directly in tests or assertions. Use the project's
`DateUtil` wrapper (`DateUtil.parse(...)`, `DateUtil.now()`) so test dates stay consistent with
what the application code actually produces, and timezone handling stays centralized.

### 5. AAA Structure with Comments
Every test body is structured with explicit `// Arrange`, `// Act`, `// Assert` comments —
not implicit grouping. Keep this even in short tests.

### 6. Exception-Specific Assertions Tied to Business Conditions
Don't just assert "it throws" — assert the specific exception class tied to the specific
business rule, matching this project's existing exception vocabulary:

| Condition | Exception |
|---|---|
| Resource already exists (e.g., profile already created for user) | `ConflictException` |
| Resource not found (e.g., profile/user lookup by id) | `NotFoundException` |
| Authenticated but lacking permission | `ForbiddenException` |
| Missing/invalid token | `UnauthorizedException` |

```typescript
await expect(service.createProfile(userId, createDto)).rejects.toThrow(
  ConflictException,
);
```

### 7. "Log and Rethrow" Is Its Own Required Test Case
For every mutating service method (`create`, `update`, `patch`, `delete`), include a dedicated
test case that simulates a database error and asserts both that the error propagates **and**
that it was logged:

```typescript
it('should log and rethrow an error if create fails', async () => {
  const dbError = new Error('Database Error');
  prisma.userProfile.findUnique.mockResolvedValue(null);
  prisma.userProfile.create.mockRejectedValue(dbError);

  await expect(service.createProfile(userId, createDto)).rejects.toThrow(dbError);
  expect(loggerServiceMock.forContext('ProfilesService').error).toHaveBeenCalled();
});
```
This is a required case, not an optional edge case — flag its absence in any review.

### 8. Soft Delete via Transaction — Test the Full Cascade
Deletes in this project are soft deletes performed inside `prisma.$transaction`, touching
multiple related tables in one callback. Tests must mock the transaction callback and assert
**every** table mutation inside it, not just the top-level call:

```typescript
const mockTx = {
  user: { update: jest.fn() },
  identity: { updateMany: jest.fn() },
  authCredential: { updateMany: jest.fn() },
  device: { updateMany: jest.fn() },
};

prisma.$transaction.mockImplementation(async (callback) => callback(mockTx as any));

await service.deleteProfile(userId);

expect(mockTx.user.update).toHaveBeenCalledWith({
  where: { id: userId },
  data: { deletedAt: expect.any(Date) },
});
expect(mockTx.device.updateMany).toHaveBeenCalledWith({
  where: { userId, isActive: true },
  data: { isActive: false },
});
```
When reviewing or writing a delete-path test, check the actual service implementation for
every table touched inside the transaction and assert each one individually — a passing test
that only checks `prisma.$transaction).toHaveBeenCalled()` without asserting the inner table
calls is incomplete and must be flagged.

### 9. Existence-Check Methods Use `select`
Boolean existence-check methods (e.g., `profileExists`) query with a minimal `select` to avoid
fetching the full row. Assert the `select` shape, not just that `findUnique` was called:

```typescript
expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
  where: { userId },
  select: { userId: true },
});
```

### 10. Controller Tests Mock the Service, Not Prisma
Controller specs (`*.controller.spec.ts`) mock the service layer entirely — they never reach
down to `PrismaService`. The controller test's job is to verify the controller calls the right
service method with the right arguments and returns its result, nothing more:

```typescript
const mockService = {
  createProfile: jest.fn(),
  getProfileByUserId: jest.fn(),
  // ...one jest.fn() per public method
};
```
Do not duplicate business-logic edge cases (conflict, not-found, transaction cascades) in the
controller spec — those belong exclusively in the service spec.

---

## Core Responsibilities

- Generate comprehensive unit tests covering edge cases, not just happy paths — for every
  mutating method, include: happy path, the relevant "already exists"/"not found" branch, and
  the "log and rethrow" case.
- Mock `PrismaService` via the shared `createPrismaMock()` factory — never inline.
- Mock `LoggerService` via the `.forContext()` pattern shown above.
- Include `ClsService` and `EventEmitter2` mocks in every service/controller test module by default.
- Use `DateUtil` for all date values in fixtures and assertions.
- Ensure tests run cleanly without side effects or reliance on external state — no real DB,
  no real HTTP calls, no real timers without `jest.useFakeTimers()`.
- Write E2E tests that validate the full HTTP request lifecycle against a real (test) database
  via Supertest — see `references/e2e-testing.md`.
- Always include `afterEach(() => jest.clearAllMocks())`.

---

## Review Checklist

When reviewing an existing or newly generated test file, verify:

- [ ] Module providers include `ClsService`, `EventEmitter2`, `LoggerService`, `PrismaService`
      (service specs) — mocked per the patterns above
- [ ] `PrismaService` mocked via `createPrismaMock()` from the shared factory, not inline
- [ ] `LoggerService` mocked via `.forContext(...)` returning `{ log, error, warn, debug, info }`
- [ ] `DateUtil.parse` / `DateUtil.now()` used instead of raw `Date`
- [ ] Every test body has `// Arrange`, `// Act`, `// Assert` comments
- [ ] Specific exception classes asserted (`ConflictException`, `NotFoundException`, etc.) —
      never a bare `toThrow()` with no class
- [ ] Every mutating method has a "log and rethrow" test case
- [ ] Delete-path tests assert every individual table mutation inside `$transaction`, not just
      that the transaction was called
- [ ] Existence-check methods assert the `select` shape used
- [ ] Controller specs mock the service only — no `PrismaService` reachable in controller specs
- [ ] `afterEach(() => jest.clearAllMocks())` present
- [ ] No real database, network, or filesystem access in unit tests
