# Common Middleware Tests

## Overview

This directory contains comprehensive unit tests for common middleware components that handle request validation, authentication, and metadata extraction.

## Test Coverage

### Test Files

#### 1. `api-key.middleware.spec.ts`

Tests for API key validation middleware.

**Coverage:**

- Middleware initialization
  - Valid API keys from JSON config
  - Missing API_KEYS error
  - Invalid JSON format error
  - Non-array JSON error
  - Empty array error
  - Filter empty strings
- Request validation
  - Valid API key acceptance
  - Missing X-API-Key header
  - Non-string X-API-Key header
  - Invalid API key rejection
  - API key stored in request

**Test Count:** 12 tests

---

#### 2. `app-check.middleware.spec.ts`

Tests for Firebase App Check token verification.

**Coverage:**

- Request validation
  - Valid App Check token
  - Lowercase header support
  - Development mode bypass
  - Production mode rejection
  - Invalid token error
  - Expired token error
  - Decoded claims attachment

**Test Count:** 8 tests

---

#### 3. `client-id.middleware.spec.ts`

Tests for client ID validation middleware.

**Coverage:**

- Middleware initialization
  - Valid client IDs from JSON config
  - Missing CLIENT_IDS error
  - Invalid JSON format error
  - Non-array JSON error
  - Empty array error
  - Filter empty strings
- Request validation
  - Valid client ID acceptance
  - Missing X-Client-ID header
  - Non-string X-Client-ID header
  - Invalid client ID rejection
  - Client ID stored in request

**Test Count:** 12 tests

---

#### 4. `device-id.middleware.spec.ts`

Tests for device ID extraction middleware.

**Coverage:**

- Request validation
  - Valid device ID acceptance
  - Missing X-Device-ID header
  - Non-string X-Device-ID header
  - Device ID stored in request

**Test Count:** 4 tests

---

#### 5. `request-id.middleware.spec.ts`

Tests for request ID extraction middleware.

**Coverage:**

- Request validation
  - Valid request ID acceptance
  - Missing X-Request-ID header
  - Non-string X-Request-ID header
  - Request ID stored in request

**Test Count:** 4 tests

---

#### 6. `user-agent.middleware.spec.ts`

Tests for user agent parsing and validation.

**Coverage:**

- Middleware initialization
  - JSON array parsing
  - Comma-separated fallback
  - Empty platforms error
  - Default values
- Request validation
  - Valid iOS user agent
  - Valid Android user agent
  - Missing User-Agent header
  - Non-string User-Agent header
  - Invalid format error
  - Invalid platform error
  - Version validation (major, minor, patch)
  - Parsed data storage

**Test Count:** 17 tests

---

## Total Test Count

**57 tests** covering all middleware validation scenarios and edge cases.

## Running Tests

### Run all middleware tests

```bash
pnpm test src/common/middleware/test
```

### Run specific test files

```bash
# API Key middleware
pnpm test src/common/middleware/test/api-key.middleware.spec.ts

# App Check middleware
pnpm test src/common/middleware/test/app-check.middleware.spec.ts

# Client ID middleware
pnpm test src/common/middleware/test/client-id.middleware.spec.ts

# Device ID middleware
pnpm test src/common/middleware/test/device-id.middleware.spec.ts

# Request ID middleware
pnpm test src/common/middleware/test/request-id.middleware.spec.ts

# User Agent middleware
pnpm test src/common/middleware/test/user-agent.middleware.spec.ts
```

### Run with coverage

```bash
pnpm test:cov src/common/middleware
```

### Run in watch mode

```bash
pnpm test:watch src/common/middleware/test
```

## Testing Strategy

### Mocking Strategy

All external dependencies are mocked to ensure unit tests are isolated and fast:

- **ConfigService**: Configuration values mocked for initialization
- **LoggerService**: Logging operations mocked
- **FirebaseService**: Firebase Admin SDK operations mocked
- **Firebase Admin**: `getAppCheck()` and `verifyToken()` mocked

### Test Structure

Each test file follows a consistent structure:

1. **Setup**: Mock dependencies and test data
2. **beforeEach**: Reset mocks and create testing module
3. **Test suites**: Organized by functionality (initialization, validation)
4. **Assertions**: Verify correct behavior and error handling

### Coverage Areas

- ✅ **Initialization**: Configuration parsing and validation
- ✅ **Header validation**: Required headers and type checking
- ✅ **Authentication**: API keys, client IDs, App Check tokens
- ✅ **Metadata extraction**: Device IDs, request IDs, user agent data
- ✅ **Version validation**: Semantic version comparison
- ✅ **Platform validation**: iOS and Android support
- ✅ **Error scenarios**: Missing headers, invalid formats, unauthorized access

## Key Test Scenarios

### API Key Middleware

- JSON array configuration parsing
- Valid/invalid API key validation
- Header presence and type checking
- API key storage in request object

### App Check Middleware

- Firebase token verification
- Development mode bypass
- Production mode enforcement
- Token expiration handling
- Decoded claims attachment

### Client ID Middleware

- JSON array configuration parsing
- Valid/invalid client ID validation
- Header presence and type checking
- Client ID storage in request object

### Device ID Middleware

- Header extraction
- Type validation
- Storage in request object

### Request ID Middleware

- Header extraction
- Type validation
- Storage in request object

### User Agent Middleware

- User agent format validation
- Platform detection (iOS, Android)
- Semantic version comparison
- Configuration parsing (JSON and CSV)
- Parsed data extraction and storage

## Dependencies

The middleware tests depend on:

- `@nestjs/testing` - NestJS testing utilities
- `jest` - Testing framework
- Mock implementations of:
  - `ConfigService`
  - `LoggerService`
  - `FirebaseService`
  - Firebase Admin SDK

## Notes

- All tests are isolated unit tests with no external dependencies
- Firebase operations are fully mocked
- Configuration is mocked to avoid environment dependencies
- Tests run quickly and can be executed in parallel
- User agent parsing follows format: `AppName/Version (Platform OSVersion; DeviceModel)`
- Version validation uses semantic versioning (major.minor.patch)
