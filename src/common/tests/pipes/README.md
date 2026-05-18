# Common Pipes Tests

## Overview

This directory contains comprehensive unit tests for common pipe components that handle request parameter validation and transformation.

## Test Coverage

### Test Files

#### 1. `enum-validation.pipe.spec.ts`

Tests for enum value validation with array support.

**Coverage:**

- Basic validation (non-optional, non-array)
  - Valid enum values
  - Invalid enum values
  - Undefined, null, empty string rejection
- Optional validation
  - Accept undefined/null/empty when optional
  - Still validate non-empty values
  - Reject invalid non-empty values
- Array validation
  - Valid array of enum values
  - Single-item arrays
  - Arrays with invalid values
  - Mixed valid/invalid values
  - Error messages with all invalid values listed
- Array conversion (isArray flag)
  - Convert single value to array
  - Reject invalid single values
  - Keep arrays as arrays
  - Validate array contents
- Optional with isArray flag
  - Accept undefined/null when optional
  - Convert valid values to arrays
- Different enum types
  - String enums
  - Numeric enums

**Test Count:** 33 tests

---

#### 2. `required-string.pipe.spec.ts`

Tests for required string parameter validation.

**Coverage:**

- Custom parameter name
  - Valid strings
  - Whitespace trimming
  - Undefined/null rejection
  - Non-string type rejection (number, object, array)
  - Empty string rejection
  - Whitespace-only string rejection
  - Strings with internal spaces
- Default parameter name
  - Error messages with default name
- Helper function
  - RequiredString() factory
  - Custom and default names
  - Valid value transformation

**Test Count:** 18 tests

---

## Total Test Count

**51 tests** covering all pipe validation scenarios and edge cases.

## Running Tests

### Run all pipes tests

```bash
pnpm test src/common/pipes/test
```

### Run specific test files

```bash
# Enum validation pipe
pnpm test src/common/pipes/test/enum-validation.pipe.spec.ts

# Required string pipe
pnpm test src/common/pipes/test/required-string.pipe.spec.ts
```

### Run with coverage

```bash
pnpm test:cov src/common/pipes
```

### Run in watch mode

```bash
pnpm test:watch src/common/pipes/test
```

## Testing Strategy

### Pure Validation Pipes

Both pipes are pure validation components with no external dependencies:

- No mocking required
- Fast, isolated unit tests
- Direct instantiation and testing

### Test Structure

Each test file follows a consistent structure:

1. **Setup**: Create pipe instances with different configurations
2. **Test suites**: Organized by validation mode (basic, optional, array, etc.)
3. **Assertions**: Verify correct values pass and invalid values throw appropriate errors

### Coverage Areas

- ✅ **Valid inputs**: Correct enum values, non-empty strings
- ✅ **Invalid inputs**: Wrong enum values, empty strings, wrong types
- ✅ **Optional mode**: Undefined/null handling
- ✅ **Array handling**: Single values, arrays, conversion
- ✅ **Error messages**: Clear, descriptive error messages
- ✅ **Edge cases**: Whitespace, mixed arrays, different enum types

## Key Test Scenarios

### Enum Validation Pipe

- Validate single enum values
- Validate arrays of enum values
- Convert single values to arrays (isArray flag)
- Handle optional values (undefined, null, empty string)
- Provide clear error messages listing valid options
- Support different enum types (string, numeric)

### Required String Pipe

- Validate non-empty strings
- Trim leading/trailing whitespace
- Reject undefined, null, and empty values
- Reject non-string types
- Provide customizable parameter names in errors
- Factory function for convenient usage

## Error Messages

### Enum Validation Pipe

- Single invalid value: `"Invalid {name}. Must be one of: {values}"`
- Invalid array values: `"Invalid {name}: [{invalid}]. Must be one of: {values}"`

### Required String Pipe

- Missing value: `"{paramName} is required"`
- Wrong type: `"{paramName} must be a string"`
- Empty value: `"{paramName} cannot be empty"`

## Dependencies

The pipe tests have no external dependencies:

- `@nestjs/common` - For pipe interfaces and exceptions
- `jest` - Testing framework
- No mocking libraries needed

## Notes

- All tests are isolated unit tests with no external dependencies
- Pipes are pure validation logic with predictable behavior
- Tests run quickly and can be executed in parallel
- Error messages are tested for clarity and usefulness
- Both pipes support customizable parameter names for better error messages
