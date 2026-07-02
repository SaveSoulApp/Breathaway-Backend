# Exception Hierarchy

Reference for domain exception design, when to use domain exceptions vs NestJS HTTP
exceptions, and the pragmatic migration path for this codebase.

---

## 1. The Two Patterns in This Codebase

### Current pattern — HTTP exceptions in the service layer
```typescript
// profiles.service.ts (existing code)
if (existingProfile) {
  throw new ConflictException('Profile already exists');
}
```
This is what the existing service tests reflect. It works, it's simple, but it violates the
`clean-architecture-expert` rule that the application layer must not know about HTTP/transport
concerns — `ConflictException` is a NestJS HTTP exception, which technically belongs in the
presentation layer.

### Target pattern — domain exceptions in the application layer
```typescript
// application/exceptions/profile-already-exists.exception.ts
import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class ProfileAlreadyExistsException extends DomainException {
  constructor(userId: string) {
    super(`A profile already exists for user ${userId}`);
    this.name = 'ProfileAlreadyExistsException';
  }
}

// profiles.service.ts (target)
if (existingProfile) {
  throw new ProfileAlreadyExistsException(userId);
}
// GlobalExceptionFilter maps ProfileAlreadyExistsException → 409 Conflict
```

---

## 2. Decision Rule — Which Pattern to Use

**Use domain exceptions (target pattern) when:**
- Writing a new module from scratch
- Refactoring an existing module for other reasons (don't do it in isolation — do it as part
  of a wider refactor of that module)
- The exception represents a genuine domain concept that may need to be caught and handled
  differently by different callers (e.g., a use case that catches `InsufficientStockException`
  specifically to try an alternative fulfillment path)

**It is acceptable to use NestJS HTTP exceptions in services when:**
- The module already consistently uses this pattern and you're adding a new method
- The exception is simple, unambiguous, and will only ever result in one HTTP status (e.g.,
  `NotFoundException` for a lookup-by-ID is always going to be a 404)
- Consistency within the module outweighs architectural purity

**Never do:**
- Mix both patterns within the same service/module without a clear migration plan
- Catch `PrismaClientKnownRequestError` inside a service and rethrow as `ConflictException`
  (that mapping belongs in `PrismaExceptionFilter`, not scattered across services)
- Use `InternalServerErrorException` for expected business failures — that's a bug, not a
  business rule

---

## 3. Base Domain Exception

All domain exceptions extend a single `DomainException` base class, so the
`GlobalExceptionFilter` can identify them as a group and apply the right HTTP mapping:

```typescript
// shared/domain/exceptions/domain.exception.ts
export abstract class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Maintains proper prototype chain in transpiled TypeScript
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

> ⚠️ The `Object.setPrototypeOf(this, new.target.prototype)` line is required when extending
> built-in classes (like `Error`) in TypeScript compiled to ES5 targets. Without it,
> `instanceof DomainException` checks fail at runtime even though they look correct in source.
> Always include this in any exception class that extends `Error` or another exception.

---

## 4. Domain Exception Catalogue

Define domain exceptions in the `application/exceptions/` folder of each module, or in
`shared/domain/exceptions/` for exceptions that cross module boundaries.

### Naming convention
`{Resource}{Condition}Exception` — explicit, matches what the service is expressing:

```typescript
// users module
export class UserNotFoundException extends DomainException {
  constructor(id: string) {
    super(`User not found: ${id}`);
  }
}

export class UserAlreadyExistsException extends DomainException {
  constructor(email: string) {
    super(`A user with email ${email} already exists`);
  }
}

// profiles module
export class ProfileNotFoundException extends DomainException {
  constructor(userId: string) {
    super(`No profile found for user ${userId}`);
  }
}

export class ProfileAlreadyExistsException extends DomainException {
  constructor(userId: string) {
    super(`A profile already exists for user ${userId}`);
  }
}
```

### Barrel Exports (index.ts)
Always create an `index.ts` file in the `application/exceptions/` folder that exports all exceptions for the module:

```typescript
// application/exceptions/index.ts
export * from './profile-not-found.exception';
export * from './profile-already-exists.exception';
```

Services and spec files must import exceptions from this consolidated barrel file rather than importing each file individually:

```typescript
import {
  ProfileAlreadyExistsException,
  ProfileNotFoundException,
} from './application/exceptions';
```

### HTTP mapping registry
The `GlobalExceptionFilter` needs to know which domain exception maps to which HTTP status.
Centralize this in one place, not scattered across individual filter `@Catch()` decorators:

```typescript
// shared/domain/exceptions/domain-exception.map.ts
import { HttpStatus } from '@nestjs/common';

export const DOMAIN_EXCEPTION_HTTP_MAP: Record<string, HttpStatus> = {
  UserNotFoundException:         HttpStatus.NOT_FOUND,
  UserAlreadyExistsException:    HttpStatus.CONFLICT,
  ProfileNotFoundException:      HttpStatus.NOT_FOUND,
  ProfileAlreadyExistsException: HttpStatus.CONFLICT,
  InvalidEmailException:         HttpStatus.BAD_REQUEST,
  InsufficientPermissionsException: HttpStatus.FORBIDDEN,
  // Add new entries here when new domain exceptions are created
};
```

Use `exception.name` (set via `this.name = this.constructor.name` in the base class) as the
lookup key — this is more reliable than `exception.constructor.name` across module boundaries
and minification.

---

## 5. When Not to Create a Domain Exception

Not every error needs a named domain exception class. Use the plain NestJS HTTP exceptions
(or the current pragmatic service pattern) for:

- **404 on a simple lookup** — `UserNotFoundException` is worth a class. A 404 on a nested
  sub-resource lookup in a service that already uses the HTTP exception pattern is not worth
  a migration just to satisfy the rule.
- **Generic validation failures** — these are handled by `ValidationPipe` (class-validator)
  before they reach the service, so no custom exception is needed.
- **Truly unexpected failures** — a database connection error, a network timeout to an
  external API. These are not domain concepts and shouldn't be wrapped in domain exception
  classes. Let them propagate as-is and be caught by the global filter as unexpected 500s.

---

## 6. Guard Exceptions

Guards throw NestJS HTTP exceptions by design — they're part of the presentation layer and
`UnauthorizedException`/`ForbiddenException` from a guard are correct and expected:

```typescript
// ✅ Correct — guards are presentation-layer components
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!isValid) throw new UnauthorizedException('Missing bearer token');
    return true;
  }
}
```

Don't apply the domain-exception pattern to guards — it would be over-engineering a component
whose only purpose is to gate HTTP access.

---

## 7. Migration Path (Existing Services)

When migrating an existing service from HTTP exceptions to domain exceptions:

1. Create the domain exception class(es) in `application/exceptions/` (importing `DomainException` via the `@shared/domain/exceptions/domain.exception` alias)
2. Create an `index.ts` barrel file in `application/exceptions/` to export all exceptions
3. Add the HTTP mapping entry to `DOMAIN_EXCEPTION_HTTP_MAP`
4. Replace `throw new ConflictException(...)` with `throw new DomainExceptionClass(...)` imported from the barrel file
5. Update the service tests — assertions change from `rejects.toThrow(ConflictException)` to
   `rejects.toThrow(ProfileAlreadyExistsException)`
6. Verify the E2E test still gets a 409 (the HTTP mapping should route it correctly)

Do **not** do this migration across the whole codebase in one PR — it's high-blast-radius and
easy to miss an unmapped exception. Migrate one module at a time, with a test run between each.
