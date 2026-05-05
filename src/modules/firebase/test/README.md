# Firebase Module Tests

## Overview

This directory contains comprehensive unit tests for the Firebase module, which handles Firebase Admin SDK initialization, FCM messaging, ID token verification, and user authentication.

## Test Coverage

### Test Files

#### 1. `firebase.service.spec.ts`

Tests for Firebase service methods.

**Coverage:**

**Initialization (3 tests):**

- `onModuleInit` - Initialize when no apps exist
- `onModuleInit` - Skip initialization when app exists
- `onModuleInit` - Log error on initialization failure
- `initializeFirebase` - Initialize with correct credentials
- `initializeFirebase` - Replace escaped newlines in private key

**Firebase Admin SDK Methods (3 tests):**

- `getMessaging` - Return messaging instance
- `verifyIdToken` - Verify valid token
- `verifyIdToken` - Throw error for invalid token
- `getUser` - Get user by UID
- `getUser` - Throw error when user not found

**Token Validation (16 tests):**

- Valid token with matching UID
- Valid token with context
- UID mismatch error
- UID mismatch with context
- Expired token error
- Revoked token error
- Invalid token format error
- Invalid token error
- Unknown Firebase error codes
- Generic errors
- Context in error messages
- Rethrow UnauthorizedException

**Test Count:** 24 tests

---

## Total Test Count

**24 tests** covering all Firebase service functionality.

## Running Tests

### Run all Firebase tests

```bash
pnpm test src/modules/firebase/test
```

### Run specific test file

```bash
pnpm test src/modules/firebase/test/firebase.service.spec.ts
```

### Run with coverage

```bash
pnpm test:cov src/modules/firebase
```

### Run in watch mode

```bash
pnpm test:watch src/modules/firebase/test
```

## Testing Strategy

### Mocking Strategy

**Firebase Admin SDK:**

- `firebase-admin` - Fully mocked using `jest.mock()`
  - `admin.apps` - App initialization state
  - `admin.initializeApp` - SDK initialization
  - `admin.credential.cert` - Credential creation
  - `admin.auth()` - Authentication methods
  - `admin.messaging()` - Messaging instance

**Service Dependencies:**

- `LoggerService` - Logging operations mocked
- `ConfigService` - Configuration values mocked

### Test Structure

Each test file follows a consistent structure:

1. **Setup**: Mock Firebase Admin SDK and dependencies
2. **beforeEach**: Reset mocks and create testing module
3. **Test suites**: Organized by method
4. **Assertions**: Verify correct behavior and error handling

### Coverage Areas

- ✅ **Initialization**: Firebase Admin SDK setup with credentials
- ✅ **Messaging**: FCM messaging instance access
- ✅ **Token Verification**: ID token validation
- ✅ **User Management**: User retrieval by UID
- ✅ **Comprehensive Validation**: Token and UID validation with auth method extraction
- ✅ **Error Handling**: All Firebase error codes and scenarios
- ✅ **Context Support**: Error messages with context information

## Key Test Scenarios

### Initialization

- Initialize Firebase when no apps exist
- Skip initialization when app already exists
- Handle initialization errors gracefully
- Replace escaped newlines in private key
- Use correct credentials from config

### Token Verification

- Verify valid ID tokens
- Reject invalid tokens
- Handle Firebase SDK errors

### User Retrieval

- Get user by UID
- Handle non-existent users

### Token Validation

- Validate token with matching UID
- Detect UID mismatches
- Handle expired tokens
- Handle revoked tokens
- Handle invalid token formats
- Handle generic Firebase errors
- Include context in error messages
- Extract authentication method information

### Error Scenarios

- `auth/id-token-expired` - Expired token
- `auth/id-token-revoked` - Revoked token
- `auth/argument-error` - Invalid format
- `auth/invalid-id-token` - Invalid token
- Unknown error codes
- Generic errors
- UID mismatch

## Dependencies

The Firebase tests depend on:

- `@nestjs/testing` - NestJS testing utilities
- `jest` - Testing framework
- Mock implementations of:
  - `firebase-admin` SDK
  - `LoggerService`
  - `ConfigService`

## Notes

- All tests are isolated unit tests with mocked dependencies
- Firebase Admin SDK is fully mocked to avoid external dependencies
- Configuration is mocked to avoid environment dependencies
- Tests run quickly and can be executed in parallel
- Error handling covers all documented Firebase error codes
- Context parameter allows for better error traceability
- Auth method extraction is tested via the validation flow
