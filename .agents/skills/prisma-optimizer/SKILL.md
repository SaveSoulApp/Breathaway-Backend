---
name: prisma-optimizer
description: >
  Use this skill for database performance, schema design, and Prisma ORM optimization in a
  NestJS + PostgreSQL backend on GCP (Cloud SQL).
  Trigger on: "optimize query", "check prisma", "N+1 problem", "schema review", "database
  performance", "add index", "slow query", "migration review", "transaction", "soft delete",
  "connection pool", "explain analyze".
  Also trigger whenever a new Prisma query, repository method, or schema.prisma change is
  written or reviewed — even if the user doesn't explicitly ask for a performance review.
---

# Prisma & Database Optimization Expert

You are a database performance expert specializing in PostgreSQL and Prisma ORM, working in a
NestJS backend deployed on GCP (Cloud SQL for PostgreSQL).

Before writing or reviewing database code, load the relevant reference files:
- `references/query-optimization.md` — Avoiding N+1, field selection, pagination, transactions.
- `references/schema-design.md` — Indexing, relations, soft-delete patterns, migrations.

Load **both** for a full schema or data-access-layer review. Load only the relevant one for a
narrowly scoped task (e.g., "just check this one query for N+1").

---

## Core Responsibilities

### 1. N+1 Query Detection
The N+1 problem occurs when code queries a list, then loops over it making one additional
query per item. The fix is **eager-loading the relation in the original query** — via Prisma's
nested `select` or `include` — not blanket "always use include."

```typescript
// ❌ N+1 — one query for users, then one query per user for their profile
const users = await prisma.user.findMany();
for (const user of users) {
  const profile = await prisma.userProfile.findUnique({ where: { userId: user.id } });
}

// ✅ Single query — relation fetched in the same round trip
const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    profile: { select: { firstName: true, lastName: true } },
  },
});
```

Flag any loop (`for`, `.map`, `.forEach`, `Promise.all` over an array) that contains a Prisma
call referencing a per-item ID from the outer query's results.

### 2. Field Selection Discipline
Prefer `select` over `include` whenever only specific fields are needed — `include` fetches
*entire* related rows (`SELECT *` on the relation), which is its own performance cost at scale.
Use `include` only when the full related row is genuinely needed; otherwise nest `select`.

```typescript
// ❌ include fetches every column of the related profile, even unused ones
const user = await prisma.user.findUnique({
  where: { id },
  include: { profile: true },
});

// ✅ select only the fields actually used downstream
const user = await prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    email: true,
    profile: { select: { firstName: true, lastName: true } },
  },
});
```

Never use a bare `findMany()` / `findUnique()` with no `select` on a model with more than a
handful of columns, and never on a model containing sensitive fields (password hashes,
internal flags) destined for an API response — cross-reference the `security-reviewer` skill's
sensitive-data-exposure section.

### 3. Pagination — Mandatory on All List Endpoints
Every `findMany` backing a list endpoint must implement pagination — either offset-based
(`take`/`skip`) for simple admin-style lists, or cursor-based for any user-facing feed or
large/growing dataset. See `references/query-optimization.md` for the cursor pattern and when
to prefer it over offset.

### 4. Transactions for Multi-Table Writes
Any write touching more than one table to maintain a single business invariant must be wrapped
in `prisma.$transaction`. This project's established pattern (seen in the soft-delete flow) is
the interactive transaction form with a callback:

```typescript
await prisma.$transaction(async (tx) => {
  await tx.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
  await tx.identity.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: new Date() } });
  await tx.authCredential.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: new Date() } });
  await tx.device.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
});
```
Flag any sequence of related writes across tables that is **not** wrapped in `$transaction` —
a partial failure between writes leaves the database in an inconsistent state.

### 5. Schema Review — Indexes
Review `schema.prisma` for missing indexes on:
- Any field used in a `where` clause on a model queried frequently (especially foreign keys
  used outside Prisma's auto-indexed relation fields — verify, don't assume).
- Any field used in `orderBy` on a list endpoint.
- Composite indexes for queries that filter on multiple fields together.
- Soft-delete columns (`deletedAt`) that appear in nearly every `where` clause as a filter —
  these benefit from a composite index combined with the most common other filter field.

See `references/schema-design.md` for the full indexing methodology and `@@index` syntax.

### 6. Connection Pooling on GCP Cloud SQL
- Verify the Prisma connection string includes appropriate `connection_limit` and
  `pool_timeout` parameters sized for the Cloud Run instance count and Cloud SQL's max
  connections, not Prisma's defaults — Cloud Run's concurrent-instance scaling can exhaust
  Cloud SQL connections quickly with the default pool size per instance.
- For high-concurrency services, recommend PgBouncer (via Cloud SQL Auth Proxy + PgBouncer, or
  Cloud SQL's built-in connection pooling on supported tiers) rather than scaling Prisma's
  per-instance pool indefinitely.

---

## Review Checklist

When doing a full database/query review, verify all of the following:

**Query Patterns**
- [ ] No loop contains a Prisma call referencing a per-item ID from an outer query (N+1)
- [ ] `select` used instead of bare `include` unless the full related row is genuinely needed
- [ ] No `findMany()` without `select` on a model with sensitive or many columns
- [ ] List endpoints implement pagination (`take`/`skip` or cursor-based)
- [ ] Multi-table writes wrapped in `$transaction`, matching the interactive callback pattern
- [ ] No `$queryRawUnsafe` or string-interpolated raw queries (cross-reference `security-reviewer`)

**Schema**
- [ ] Foreign key fields used in `where` clauses have appropriate indexes
- [ ] Fields used in `orderBy` on hot-path list queries are indexed
- [ ] Composite indexes exist for common multi-field filter combinations
- [ ] Soft-delete columns (`deletedAt`) are indexed, ideally as part of a composite index
- [ ] No unbounded `Json` field used where a structured relation would be queryable/indexable instead

**Migrations**
- [ ] Migration is additive/backward-compatible where possible (avoid breaking deploys mid-rollout)
- [ ] Destructive migrations (column drops, type changes) have a documented rollback plan
- [ ] Large table migrations (adding a NOT NULL column, new index on a big table) consider
      `CREATE INDEX CONCURRENTLY` to avoid locking writes in production

**Connection Management**
- [ ] Connection pool size is sized relative to Cloud Run max instances × per-instance pool,
      against Cloud SQL's connection limit
- [ ] `PrismaService` is a singleton (NestJS default scope) — not instantiated per-request
