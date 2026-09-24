# CI Quality Gates Reference & Troubleshooting Guide

This reference document explains the technical specifics and troubleshooting guidelines for each quality gate defined in `.github/workflows/tests.yaml`.

---

## 1. Toolchain & Dependencies

- **Node.js**: `20.x`
- **pnpm**: `version 10`
- **Installation flag**: `--frozen-lockfile` (ensures `pnpm-lock.yaml` is not out of sync with `package.json`).

### Troubleshooting
- If dependencies mismatch or lockfile is out of sync, run `pnpm install` without `--frozen-lockfile` locally, test, and commit the updated `pnpm-lock.yaml`.

---

## 2. Prisma Client Generation

```bash
DATABASE_URL="postgresql://ci:ci@localhost:5432/ci" pnpm exec prisma generate
```

### Why the Dummy DSN?
In `prisma.config.ts`:
```typescript
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url:
      process.env.OPERATION_MODE === 'migration'
        ? env('DIRECT_URL')
        : env('DATABASE_URL'),
  },
});
```
`prisma.config.ts` eagerly validates `DATABASE_URL` at load time even for `prisma generate` (which generates TypeScript client types and does not connect to any database). Supplying a dummy DSN satisfies the eager check without requiring live database credentials in CI.

### Common Issues
- **Syntax error in `schema.prisma`**: Missing curly braces, invalid relation attributes (`@relation(fields: [...], references: [...])`), or mismatched types.
- **NEVER** run `prisma migrate dev` or `prisma db push` without explicit human permission.

---

## 3. Prettier Formatting & Import Organization

### Import Hierarchy (4 Groups)
Each TypeScript file must separate imports into 4 alphabetized groups separated by a blank line:
1. **Built-in Node modules** (e.g. `crypto`, `path`, `fs`)
2. **External npm packages** (e.g. `@nestjs/common`, `@nestjs/swagger`, `dayjs`)
3. **Internal absolute modules** (e.g. `@modules/...`, `@infrastructure/...`, `@shared/...`, `@common/...`, `@core/...`)
4. **Local relative paths** (e.g. `./dto/...`, `./entities/...`)

### Deep Relative Path Rule
Any import navigating more than 2 directory levels (`../../../`) must use absolute paths or path aliases configured in `tsconfig.json`.

### Prettier Check
ESLint enforces Prettier rules as errors (`'prettier/prettier': ['error', { endOfLine: 'auto' }]`).
Run:
```bash
npx prettier --write "src/**/*.ts" "test/**/*.ts"
```

---

## 4. ESLint Rules Specific to This Codebase

In `eslint.config.mjs`, several strict rules are configured:

1. **`local/no-missing-log-step`** (Applies to `**/*.service.ts`):
   - Every `this.logger.log(...)`, `warn(...)`, or `error(...)` call inside a NestJS service MUST pass a metadata object containing a `step` key.
   - Example:
     ```typescript
     this.logger.log('Initiating credit deduction', {
       step: 'deduct_credits_start',
       userId,
       amount,
     });
     ```
2. **`@typescript-eslint/no-unused-vars`**:
   - Variables, arguments, caught errors, and destructured elements must either be used or prefixed with `_`.
3. **`@typescript-eslint/no-misused-promises`**:
   - Happens when passing an async function to a callback expecting a void return or ignoring promise results.
   - Example in tests: ensure `it('should ...', async () => { ... })` properly awaits all promises.
4. **`@typescript-eslint/no-unsafe-*`**:
   - Avoid `any` types; cast to typed interfaces or use unknown with proper type guards.

---

## 5. TypeScript Compiler (`tsc --noEmit`)

```bash
pnpm exec tsc --noEmit
```

- Verifies that all types, DTO contracts, Prisma models, and method signatures conform to TypeScript strict mode.
- Does not emit JavaScript artifacts; exits with 0 on clean check or list of compile errors on failure.

---

## 6. Jest Unit Tests & Coverage

```bash
pnpm exec jest --coverage --ci --passWithNoTests
```

- Runs all `*.spec.ts` files matching root `src`.
- Generates a coverage summary at `coverage/coverage-summary.json`.
- In CI, the summary is displayed directly on the GitHub Actions PR job summary page.
- Always verify that unit tests mock external dependencies using `jest-mock-extended` or custom mock factories rather than trying to make live network or database connections.
