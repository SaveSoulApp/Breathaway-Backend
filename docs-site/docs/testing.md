---
sidebar_position: 6
---

# Testing Guide

This guide details the testing framework, test types, and coding patterns used to ensure the reliability and stability of the BreathAway API.

---

## 🧪 Test Types

BreathAway backend uses a dual testing strategy:
1. **Unit Tests**: Test individual classes, services, or helpers in isolation. Database and third-party API calls are fully mocked.
2. **End-to-End (E2E) Tests**: Run the full NestJS application instance against a test database instance to verify HTTP controllers, pipes, guards, filters, and complete business flows.

---

## 🏃‍♂️ Running Tests

All test commands are run from the project root using pnpm:

```bash
# Run unit tests
pnpm run test

# Run unit tests with watch mode
pnpm run test:watch

# Run unit tests and generate coverage report
pnpm run test:cov

# Run E2E integration tests
pnpm run test:e2e
```

### Coverage Thresholds
Unit test coverage outputs reports to the `/coverage` directory. We aim for high coverage on business services, while excluding module files (`.module.ts`) and main configs.

---

## 🛠 Testing Setup & Tooling

We use the following stack for testing:
- **Test Runner**: [Jest](https://jestjs.io/)
- **Integration Framework**: [Supertest](https://github.com/ladjs/supertest) (for E2E request assertions)
- **Mocks Utility**: `jest-mock-extended` (for clean database/service mocking)

---

## ✍️ Coding Patterns: Writing Tests

When writing tests for BreathAway, we enforce the **AAA (Arrange-Act-Assert)** pattern.

### 1. Unit Test Structure (AAA Pattern)
Here is the standard pattern for mocking and testing a service:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { ProfilesService } from './profiles.service';

describe('ProfilesService', () => {
  let service: ProfilesService;
  let prismaMock: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    // 1. Arrange: Create deep mocks of dependencies
    prismaMock = mockDeep<PrismaService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);
  });

  it('should create a user profile successfully', async () => {
    // Arrange (setup mock database resolution)
    const mockProfile = { id: 'ulid_1', userId: 'user_1', firstName: 'John' };
    prismaMock.userProfile.create.mockResolvedValue(mockProfile as any);

    // 2. Act: Execute the service call
    const result = await service.createProfile('user_1', { firstName: 'John' });

    // 3. Assert: Validate return value and call count
    expect(result).toEqual(mockProfile);
    expect(prismaMock.userProfile.create).toHaveBeenCalledTimes(1);
  });
});
```

### 2. E2E Test Structure
E2E tests are stored in `/test/` and run against a separate database configuration defined in `.env.test`.

Each E2E test file bootstraps a mini application module:
```typescript
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('HealthController (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-api-key', 'mock_key') // bypass ClientIdentityGuard
      .set('x-client-id', 'mock_client')
      .set('x-device-id', 'mock_device')
      .set('User-Agent', 'BreathAway/1.0.0 (iOS 17.4; iPhone15)')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });
});
```
