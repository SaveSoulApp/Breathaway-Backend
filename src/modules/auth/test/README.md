# Auth Module Tests

## Overview

This directory contains comprehensive unit tests for the authentication module, covering all authentication flows, validation logic, JWT strategy, and utility functions.

## Test Coverage

### Test Files

#### 1. `auth.controller.spec.ts`

Tests for the authentication controller endpoints.

**Coverage:**

- `POST /auth/signup` - User signup with Firebase token
- `POST /auth/signin` - User signin with Firebase token
- `POST /auth/signin-or-signup` - Flexible signin/signup endpoint
- `PATCH /auth/add-phone` - Add phone to existing user (authenticated)
- `PATCH /auth/add-email` - Add email to existing user (authenticated)
- `POST /auth/signout` - User signout

**Test Count:** 18 tests

---

#### 2. `auth.service.spec.ts`

Tests for the core authentication service logic.

**Coverage:**

- **signup**: Create new users with Google or phone authentication
  - Successful signup with Google auth
  - Successful signup with phone auth
  - Conflict detection for existing users
  - JWT token generation
- **signin**: Authenticate existing users
  - Signin with Google auth
  - Signin with phone auth
  - User not found errors
  - Verification status updates
- **signInOrSignUp**: Flexible authentication
  - Signin for existing users
  - Signup for new users
  - Verification updates
- **addSecondaryAuth**: Add secondary authentication methods
  - Add phone to email-only users
  - Add email to phone-only users
  - Validation and conflict checking
- **signout**: Placeholder implementation

**Test Count:** 26 tests

---

#### 3. `auth-verification.service.spec.ts`

Tests for authentication validation logic.

**Coverage:**

- **validateAuthMethodType**: Ensure auth method matches expected type
  - Phone method validation
  - Google/email method validation
  - Type mismatch errors
- **validateUserHasNoExistingAuthMethod**: Check for existing auth methods
  - Validation for phone addition
  - Validation for email addition
  - Conflict detection
- **validateAuthIdentifierNotUsedByOthers**: Prevent duplicate identifiers
  - Phone uniqueness validation
  - Email uniqueness validation
  - Same-user exception handling

**Test Count:** 12 tests

---

#### 4. `jwt.strategy.spec.ts`

Tests for JWT authentication strategy.

**Coverage:**

- Strategy initialization with ConfigService
- Token payload validation
- User object extraction (userId, email)
- JWT configuration (secret, audience, issuer)

**Test Count:** 8 tests

---

#### 5. `auth-method.utils.spec.ts`

Tests for authentication utility functions.

**Coverage:**

- **getAuthMethodFromDecodedToken**: Parse Firebase tokens
  - Phone authentication extraction
  - Email/password authentication extraction
  - Google authentication extraction
  - Verification status handling
  - Error handling for missing/invalid data
  - Unsupported provider detection

**Test Count:** 13 tests

---

## Total Test Count

**77 tests** covering all authentication scenarios, edge cases, and error conditions.

## Running Tests

### Run all auth module tests

```bash
pnpm test src/modules/auth/test
```

### Run specific test files

```bash
# Controller tests
pnpm test src/modules/auth/test/auth.controller.spec.ts

# Service tests
pnpm test src/modules/auth/test/auth.service.spec.ts

# Verification service tests
pnpm test src/modules/auth/test/auth-verification.service.spec.ts

# JWT strategy tests
pnpm test src/modules/auth/test/jwt.strategy.spec.ts

# Utility tests
pnpm test src/modules/auth/test/auth-method.utils.spec.ts
```

### Run with coverage

```bash
pnpm test:cov src/modules/auth
```

### Run in watch mode

```bash
pnpm test:watch src/modules/auth/test
```

## Testing Strategy

### Mocking Strategy

All external dependencies are mocked to ensure unit tests are isolated and fast:

- **PrismaService**: Database operations mocked with jest functions
- **FirebaseService**: Firebase Admin SDK operations mocked
- **JwtService**: JWT token generation mocked
- **ConfigService**: Configuration values mocked
- **LoggerService**: Logging operations mocked
- **AuthVerificationService**: Validation logic mocked in service tests

### Test Structure

Each test file follows a consistent structure:

1. **Setup**: Mock dependencies and test data
2. **beforeEach**: Reset mocks and create testing module
3. **Test suites**: Organized by method/endpoint
4. **Assertions**: Verify correct behavior and error handling

### Coverage Areas

- ✅ **Happy paths**: Successful authentication flows
- ✅ **Error scenarios**: Invalid tokens, missing users, conflicts
- ✅ **Edge cases**: Unverified users, duplicate identifiers
- ✅ **Validation**: Auth method type checking, uniqueness validation
- ✅ **Integration**: Service-to-service communication
- ✅ **JWT**: Token generation and validation

## Key Test Scenarios

### Authentication Flows

- Google OAuth authentication
- Phone number authentication
- Email/password authentication
- Flexible signin-or-signup flow

### Secondary Auth Addition

- Adding phone to email-only users
- Adding email to phone-only users
- Preventing duplicate auth methods
- Preventing identifier conflicts

### Validation & Security

- Firebase token validation
- JWT token generation
- Auth method type validation
- Identifier uniqueness enforcement
- Verification status management

### Error Handling

- User not found scenarios
- Duplicate user conflicts
- Invalid auth method types
- Missing required fields
- Unsupported authentication providers

## Dependencies

The auth module tests depend on:

- `@nestjs/testing` - NestJS testing utilities
- `jest` - Testing framework
- Mock implementations of:
  - `PrismaService`
  - `FirebaseService`
  - `JwtService`
  - `ConfigService`
  - `LoggerService`

## Notes

- All tests are isolated unit tests with no external dependencies
- Firebase operations are fully mocked
- Database operations are mocked to avoid database connections
- Tests run quickly and can be executed in parallel
- JWT token generation is mocked for consistent test results
