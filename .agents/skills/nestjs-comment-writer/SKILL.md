---
name: nestjs-comment-writer
description: >
  Writes standardized TSDoc/JSDoc comments for NestJS TypeScript code — Controllers,
  Services, Modules, DTOs, Guards, Interceptors, and Pipes. Use this skill whenever
  the user wants to document, annotate, or add comments to NestJS code, even if they
  phrase it casually ("add docs to this", "comment this service", "explain what this does").
  Also trigger when the user shares NestJS code that is missing comments and asks for a
  review or refactor — documentation is part of production readiness.

  Focus areas:
  1. Business logic: WHY this code exists and WHAT problem it solves
  2. Functional utility: WHAT each function/method does mechanically
---

# NestJS Comment Writer

You are writing production-grade comments for a NestJS TypeScript codebase. Your goal is not
just to describe what the code does mechanically — it's to explain **why** it exists and
**what business or infrastructure problem** it solves. A new engineer joining the team should
understand intent and context, not just syntax.

Read `references/patterns.md` for detailed per-element templates and annotated examples before
generating any output.

---

## Core Principles

**Two-layer commenting**: Every significant element needs both layers:
1. **Business logic layer** — What domain problem is this solving? Why does this function exist? What would break if it didn't?
2. **Utility layer** — What does this function do mechanically? What are its inputs, outputs, side effects, and failure modes?

**Don't state the obvious**: If the parameter name and type already make the intent clear, don't
repeat it in prose. Instead, spend that sentence explaining behavior that *isn't* captured in
the signature (e.g., validation rules, side effects, caching behavior, external calls made).

**Be specific about failure**: Use `@throws` whenever the method can throw — specify the
exception class and the *condition* that triggers it, not just that it exists.

**Keep it punchy**: Comments should read like terse technical prose, not marketing copy. Aim
for 1–2 sentences per logical point. Remove filler words like "this method is responsible for".

---

## When to Apply Comments

| Element | Class-level comment | Method/property comments |
|---|---|---|
| Controller | Yes — describe the HTTP resource group and auth scope | Every route handler |
| Service / Provider | Yes — describe the business domain it owns | Every public method |
| Module | Yes — explain the bounded context and why each import/export exists | N/A |
| DTO | Yes — describe the shape's purpose | Decorate each field with validation context |
| Guard | Yes — what access rule it enforces | `canActivate` + any helpers |
| Interceptor | Yes — what transformation or cross-cutting concern | `intercept` |
| Pipe | Yes — what validation or transformation | `transform` |
| Repository / custom provider | Yes | Every public method |

---

## Comment Structure Rules

### Class-level JSDoc
```ts
/**
 * [One sentence: what domain/resource this class owns and why it exists.]
 *
 * [Optional second sentence: auth scope, external dependencies, or notable constraints.]
 */
```

### Method-level JSDoc
```ts
/**
 * [One sentence: business intent — what and why.]
 *
 * [Optional: behavioral nuances not obvious from the signature — side effects, caching,
 *  transactional scope, calls to external systems.]
 *
 * @param paramName - [What this value represents; include expected format or constraints
 *                     that aren't already in the type. Skip if the type alone is self-explanatory.]
 * @returns [What the resolved value represents, not just its type.]
 * @throws {ExceptionClass} When [specific condition, not just "on error"].
 */
```

### Module-level JSDoc
```ts
/**
 * [Domain capability this module encapsulates — one sentence.]
 *
 * Imports: [why each import is needed — what capability it provides]
 * Exports: [what this module exposes to other modules and why]
 */
```

### DTO property comments
Use inline comments above each field if the field's purpose or validation constraints aren't
obvious from its name and decorators alone:
```ts
/** ISO 8601 date string; must be in the future relative to request time. */
@IsDateString()
scheduledAt: string;
```

---

## Formatting Constraints

- Use `/** ... */` for all TSDoc blocks. Never use `//` for doc comments.
- Align multi-line `@param` descriptions by hanging-indent to the dash column.
- Don't add `@param` for `req: Request` or `res: Response` in controllers — these are
  framework-injected and self-evident from the NestJS context.
- Do add `@param` for route params (`@Param()`), query params (`@Query()`), and body
  DTOs (`@Body()`) when the name alone doesn't describe expected content or constraints.
- Use `@returns` (not `@return`). If the return is `Promise<void>`, omit `@returns` unless
  there is meaningful side-effect context to document.
- Maximum one blank line between `@param` blocks and the `@returns` / `@throws` block.

---

## Reference Files

- `references/patterns.md` — Full annotated templates and before/after examples for each
  NestJS element type. **Read this before generating any output.**