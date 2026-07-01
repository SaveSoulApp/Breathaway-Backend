# Mocking Strategy

Reference for mocking `PrismaService`, `LoggerService`, `ClsService`, `EventEmitter2`, and
other injected dependencies, matching this project's established conventions exactly.

---

## 1. PrismaService — Always Use the Shared Mock Factory

**Never** hand-roll a Prisma mock inline with `jest-mock-extended`'s `mockDeep<PrismaClient>()`
directly in a spec file. This project has a shared factory — use it, and extend it (in one
place) if a model is missing, rather than duplicating mock setup per spec.

```typescript
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';

describe('ProfilesService', () => {
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: PrismaService, useValue: createPrismaMock() },
        // ...other providers
      ],
    }).compile();

    prisma = module.get(PrismaService);
  });
});
```

### Factory internals (for reference / extension)
The factory wraps `jest-mock-extended`'s `mockDeep<PrismaClient>()` so every model
(`prisma.userProfile`, `prisma.user`, `prisma.identity`, etc.) and method
(`findUnique`, `findMany`, `create`, `update`, `updateMany`, `delete`, `$transaction`)
is auto-mocked with the correct Prisma-generated types, giving full autocomplete and
type-checking in specs.

```typescript
// @infrastructure/database/tests/mocks/prisma.mock.ts (shape — extend here, not per-spec)
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

export type MockPrismaService = DeepMockProxy<PrismaClient>;

export function createPrismaMock(): MockPrismaService {
  return mockDeep<PrismaClient>();
}
```

If a new Prisma model needs special mock behaviour (e.g., a default return value), add it as
an optional configuration parameter to `createPrismaMock()` rather than overriding it ad hoc
in individual spec files — keeps mock behaviour discoverable in one place.

### Mocking `$transaction`
`$transaction` is mocked by capturing and immediately invoking the callback with a `tx` mock
object exposing only the models actually touched inside that transaction:

```typescript
const mockTx = {
  user: { update: jest.fn() },
  identity: { updateMany: jest.fn() },
  authCredential: { updateMany: jest.fn() },
  device: { updateMany: jest.fn() },
};

prisma.$transaction.mockImplementation(async (callback) => {
  return callback(mockTx as any);
});
```
Build `mockTx` to match exactly what the service implementation uses inside the transaction —
don't include unused models, and don't omit any that are actually called (a missing one means
that mutation goes silently unverified).

---

## 2. LoggerService — `.forContext()` Pattern

This project's `LoggerService` is not injected as a flat logger. Every call site does
`this.logger.forContext('ServiceName')` first, then calls `.log()` / `.error()` / etc. on the
returned context logger. Mock both levels:

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

For controller specs where logging isn't the focus of any assertion, a lighter version is
acceptable:
```typescript
const loggerServiceMock = {
  forContext: jest.fn().mockReturnValue({ log: jest.fn() }),
};
```

**Asserting log calls** — always assert through the same chain, matching the exact context
name the service uses:
```typescript
expect(loggerServiceMock.forContext('ProfilesService').error).toHaveBeenCalled();
```

> ⚠️ Common mistake: calling `loggerServiceMock.forContext('ProfilesService')` a second time
> in the assertion returns the **same mocked return value** (because `mockReturnValue` always
> returns the same object), so this works correctly — but if the context name string doesn't
> exactly match what the service passes, the assertion still technically passes (since
> `forContext` always returns the same mock regardless of argument) which can mask a wrong
> context name in production code. Optionally also assert
> `expect(loggerServiceMock.forContext).toHaveBeenCalledWith('ProfilesService')` when the
> context name itself matters to the test.

---

## 3. ClsService (nestjs-cls)

`ClsService` shows up in nearly every test module because it's wired in via a shared
interceptor/module. Mock minimally unless the test specifically exercises CLS-stored context
(e.g., request-scoped user ID, correlation ID):

```typescript
{ provide: ClsService, useValue: { get: jest.fn() } }
```

If a test needs a specific CLS value (e.g., a correlation ID used in logging), configure the
mock's return value explicitly in that test:
```typescript
clsServiceMock.get.mockReturnValue('correlation-id-123');
```

---

## 4. EventEmitter2

Mock with a bare `emit` spy unless the test asserts event payloads:
```typescript
{ provide: EventEmitter2, useValue: { emit: jest.fn() } }
```

When a service is expected to emit a domain event (e.g., after a successful create), assert
both the event name and payload shape:
```typescript
expect(eventEmitter.emit).toHaveBeenCalledWith(
  'profile.created',
  expect.objectContaining({ userId, profileId: mockUserProfile.id }),
);
```

---

## 5. DateUtil — Never Raw `Date`

Use the project's `DateUtil` wrapper everywhere a date is needed in a fixture or assertion:

```typescript
import { DateUtil } from '@common/utils/date.utils';

const mockUserProfile: UserProfile = {
  // ...
  dateOfBirth: DateUtil.parse('1990-01-01'),
  createdAt: DateUtil.now(),
  updatedAt: DateUtil.now(),
};
```

When asserting a value the service sets dynamically (e.g., `deletedAt` on soft delete), use
`expect.any(Date)` rather than a fixed `DateUtil.now()` call, since the exact timestamp won't
match between test setup and execution:
```typescript
expect(mockTx.user.update).toHaveBeenCalledWith({
  where: { id: userId },
  data: { deletedAt: expect.any(Date) },
});
```

---

## 6. Mocking the Service Layer in Controller Specs

Controller specs mock the entire service with one `jest.fn()` per public method — they never
reach into `PrismaService`, `LoggerService`'s internals beyond what's needed to satisfy DI, or
any business logic:

```typescript
const mockService = {
  createProfile: jest.fn(),
  getProfileByUserId: jest.fn(),
  getProfileById: jest.fn(),
  updateProfile: jest.fn(),
  patchProfile: jest.fn(),
  deleteProfile: jest.fn(),
};

const module: TestingModule = await Test.createTestingModule({
  controllers: [ProfilesController],
  providers: [
    { provide: ClsService, useValue: { get: jest.fn() } },
    { provide: EventEmitter2, useValue: { emit: jest.fn() } },
    { provide: ProfilesService, useValue: mockService },
    { provide: LoggerService, useValue: loggerServiceMock },
  ],
}).compile();
```

A controller test asserts two things only, per method:
1. The service method was called with the correct arguments (mapped correctly from the
   request — path param, body, decorator-extracted user ID, etc.)
2. The controller returns the service's result unmodified (unless the controller is
   responsible for response shaping, in which case assert the shaped output)

```typescript
it('should successfully create and return a profile', async () => {
  const createDto: CreateProfileRequestDto = { firstName: 'John', lastName: 'Doe' };
  service.createProfile.mockResolvedValue(mockUserProfile);

  const result = await controller.createProfile(userId, createDto);

  expect(service.createProfile).toHaveBeenCalledWith(userId, createDto);
  expect(result).toEqual(mockUserProfile);
});
```

---

## 7. Mocking External APIs / Third-Party SDKs

For dependencies wrapped behind a project abstraction (e.g., an `EmailService` interface
wrapping SendGrid, or a `FirebaseAdmin` token), mock the abstraction directly via
`.overrideProvider()` or a plain `useValue` mock — never reach into the third-party SDK's
internals in a unit test:

```typescript
{ provide: EMAIL_SERVICE, useValue: { sendWelcome: jest.fn() } }
```

For HTTP-based external calls not yet wrapped behind an interface, use `nock` to intercept at
the network layer rather than mocking `axios`/`fetch` directly — this catches accidental
real-network calls that a method-level mock would silently hide.

---

## 8. Required Cleanup

Every spec file must include:
```typescript
afterEach(() => {
  jest.clearAllMocks();
});
```
This is mandatory, not optional — omitting it allows mock call history to leak between tests
within the same `describe` block, producing false positives on `toHaveBeenCalledWith`
assertions in later tests.
