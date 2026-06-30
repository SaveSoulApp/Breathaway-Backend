# E2E Testing — Supertest Structure

Reference for structuring end-to-end tests that exercise the full HTTP request lifecycle,
consistent with this project's unit test conventions (AAA structure, `DateUtil`, shared mocks
where applicable) but running against a real (test) NestJS application instance and database.

---

## 1. When to Write an E2E Test vs a Unit Test

- **Unit test** (`*.spec.ts`, co-located with the file under test): business logic branching,
  exception conditions, transaction cascades, mock-verifiable behaviour. Fast, no real I/O.
- **E2E test** (`*.e2e-spec.ts`, in `test/`): the full request pipeline — guards, pipes,
  interceptors, serialization, actual route wiring, actual (test) database round-trip.
  Slower, fewer of them, covering the critical path per feature rather than every branch.

Don't duplicate every unit-test edge case at the E2E level. E2E tests should cover: the happy
path, auth enforcement (401/403), validation enforcement (400), and one or two of the most
important business-rule failures (409/404) — not the full matrix already covered by unit tests.

---

## 2. Test App Bootstrap

```typescript
// test/profiles.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@infrastructure/database/prisma.service';

describe('ProfilesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Mirror the exact global pipe config from main.ts — E2E must test real validation behaviour
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = app.get(PrismaService);
    authToken = await getTestAuthToken(); // see section 5
  });

  afterAll(async () => {
    await app.close();
  });

  // ...
});
```

> ⚠️ Always re-apply the same global pipes, filters, and interceptors configured in `main.ts`.
> An E2E test that skips `app.useGlobalPipes(...)` will pass validation it shouldn't, giving a
> false sense of security about input validation that only exists in production config.

---

## 3. Database State — Isolated Test Database, Not Mocks

E2E tests run against a real PostgreSQL test database (separate instance/schema from dev and
prod — never point E2E tests at a shared dev database). Use Prisma directly to set up and tear
down fixture data; do not mock `PrismaService` here.

```typescript
beforeEach(async () => {
  // Arrange — seed only what this test needs, scoped and cleaned per test
  await prisma.userProfile.deleteMany({ where: { userId: testUserId } });
});

afterEach(async () => {
  await prisma.userProfile.deleteMany({ where: { userId: testUserId } });
});
```

**Rules:**
- Each test cleans up its own data — don't rely on test execution order for state.
- Prefer `beforeEach`/`afterEach` scoped deletes over a full DB wipe between every test
  (full wipes are slow and hide ordering bugs that scoped cleanup would catch).
- Use a dedicated test user/tenant ID per spec file to avoid cross-file collisions if tests
  run in parallel.
- Run E2E tests against a database migrated via `prisma migrate deploy` in CI, mirroring
  production migration behaviour — never `prisma db push` for E2E in CI.

---

## 4. Request Structure (AAA, matching unit test style)

```typescript
describe('POST /v1/profiles', () => {
  it('should create a profile and return 201', async () => {
    // Arrange
    const createDto = { firstName: 'John', lastName: 'Doe' };

    // Act
    const response = await request(app.getHttpServer())
      .post('/v1/profiles')
      .set('Authorization', `Bearer ${authToken}`)
      .send(createDto)
      .expect(201);

    // Assert
    expect(response.body).toMatchObject({
      firstName: 'John',
      lastName: 'Doe',
      userId: testUserId,
    });

    const dbRecord = await prisma.userProfile.findUnique({ where: { userId: testUserId } });
    expect(dbRecord).not.toBeNull();
  });

  it('should return 409 if profile already exists', async () => {
    // Arrange
    await prisma.userProfile.create({ data: { userId: testUserId, firstName: 'A', lastName: 'B' } });

    // Act & Assert
    await request(app.getHttpServer())
      .post('/v1/profiles')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ firstName: 'John', lastName: 'Doe' })
      .expect(409);
  });

  it('should return 400 for invalid payload', async () => {
    await request(app.getHttpServer())
      .post('/v1/profiles')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ firstName: '' })   // fails class-validator rules
      .expect(400);
  });

  it('should return 401 without a valid auth token', async () => {
    await request(app.getHttpServer())
      .post('/v1/profiles')
      .send({ firstName: 'John', lastName: 'Doe' })
      .expect(401);
  });
});
```

---

## 5. Auth in E2E Tests (Firebase / Identity Platform)

Never call the real Firebase Auth service from CI E2E tests. Use the Firebase Auth emulator
and generate a real-but-emulated token, so the actual `FirebaseAuthGuard` verification path is
exercised (not bypassed via a mocked guard) — this is what makes it a true E2E test of the
auth flow.

```typescript
// test/utils/auth.ts
import * as admin from 'firebase-admin';

export async function getTestAuthToken(uid = 'e2e-test-user'): Promise<string> {
  // Requires FIREBASE_AUTH_EMULATOR_HOST set in the test environment
  const customToken = await admin.auth().createCustomToken(uid);
  // Exchange for an ID token via the emulator's REST endpoint
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const data = await response.json();
  return data.idToken;
}
```

CI must set `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099` (or equivalent) before running the
E2E suite — never run E2E auth tests against the real production/staging Identity Platform tenant.

For role-based E2E cases (testing `@Roles('ADMIN')` enforcement), set custom claims on the
emulated user before generating the token:
```typescript
await admin.auth().setCustomUserClaims(uid, { roles: ['ADMIN'] });
```

---

## 6. Testing Validation Enforcement End-to-End

E2E is the right place to confirm the *global* `ValidationPipe` config actually rejects
unexpected fields (mass-assignment protection) — this can't be verified at the unit level
since it's pipeline configuration, not business logic:

```typescript
it('should reject unexpected fields (mass assignment protection)', async () => {
  await request(app.getHttpServer())
    .post('/v1/profiles')
    .set('Authorization', `Bearer ${authToken}`)
    .send({ firstName: 'John', lastName: 'Doe', role: 'ADMIN' })  // role is not a DTO field
    .expect(400);
});
```

---

## 7. Response Shape Assertions

Assert against the documented `ResponseDto` shape, not the raw Prisma model — this also
catches accidental leakage of fields that should have been excluded (cross-reference the
`api-design-expert` and `security-reviewer` skills):

```typescript
expect(response.body).not.toHaveProperty('password');
expect(response.body).not.toHaveProperty('firebaseUid');
expect(Object.keys(response.body).sort()).toEqual(
  ['id', 'userId', 'firstName', 'lastName', 'dateOfBirth', 'createdAt', 'updatedAt'].sort(),
);
```

---

## 8. Performance & CI Considerations

- E2E suites are slower — run them in CI as a separate job/stage from unit tests, not blocking
  fast feedback on every commit if the project uses a staged CI pipeline.
- Use `--runInBand` for E2E Jest config if tests share a single test database and aren't
  isolated by per-test transactions, to avoid race conditions between parallel test files.
- Consider wrapping each E2E test in a Prisma `$transaction` that's rolled back at the end
  (test transaction pattern) if test speed becomes a bottleneck — but only adopt this if the
  app code doesn't itself rely on `$transaction` in ways that would conflict with a wrapping
  transaction.

---

## 9. Required Structure Summary

Every `*.e2e-spec.ts` file must have:
- [ ] `beforeAll`: bootstrap app with the same global pipes/filters as `main.ts`
- [ ] `afterAll`: `app.close()`
- [ ] `beforeEach`/`afterEach`: scoped test data cleanup, not a full DB wipe
- [ ] Auth token generated via the Firebase Auth emulator, not a mocked guard
- [ ] At least one test per: happy path (2xx), validation failure (400), auth failure (401),
      authorization failure (403) if role-gated, and the primary business-rule conflict (404/409)
- [ ] Response shape asserted against the `ResponseDto` contract, including absence of
      sensitive fields
