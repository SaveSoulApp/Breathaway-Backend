# Schema Design — Indexing & Relations

Reference for `schema.prisma` review: indexing strategy, relation modeling, soft-delete
patterns, and migration safety on PostgreSQL (Cloud SQL).

---

## 1. Indexing Fundamentals

### Prisma auto-indexes
Prisma automatically creates an index for:
- The `@id` field (primary key)
- Any field marked `@unique`
- The scalar field backing a `@relation` (the foreign key column) — **only since Prisma 5.x
  with relation mode default; verify this project's Prisma version, since older versions or
  `relationMode = "prisma"` setups may not auto-index foreign keys.**

```bash
# Verify Prisma version and relation mode
grep -A2 "generator client" prisma/schema.prisma
grep "relationMode" prisma/schema.prisma
```

### When to add an explicit `@@index`
Add an index when a field (or combination of fields) appears in:
- A `where` clause on a query executed frequently (anything on a hot path: login, list
  endpoints, dashboard queries)
- An `orderBy` clause on a list endpoint
- Both together — a composite index ordered to match the query pattern

```prisma
model Order {
  id        String   @id @default(uuid())
  userId    String
  status    OrderStatus
  createdAt DateTime @default(now())
  deletedAt DateTime?

  user User @relation(fields: [userId], references: [id])

  // Composite index matching the common query: "this user's active orders, newest first"
  @@index([userId, deletedAt, createdAt])
}
```

### Composite index column order matters
PostgreSQL composite indexes are usable left-to-right — a query filtering on the first column(s)
of the index can use it; a query filtering only on a later column cannot (without a separate
index). Order composite index columns by: equality filters first, then range/sort filters last.

```prisma
// Query pattern: WHERE userId = ? AND deletedAt IS NULL ORDER BY createdAt DESC
@@index([userId, deletedAt, createdAt])
// ✅ Usable for: userId lookup, userId+deletedAt lookup, and the full pattern with sort
// ❌ NOT usable for a query that only filters on createdAt without userId
```

---

## 2. Soft Delete Pattern (project standard)

This project uses soft deletes via a nullable `deletedAt: DateTime?` column, not hard deletes,
on user-related models (`User`, `Identity`, `AuthCredential`) — consistent with the cascade
pattern seen in the existing `deleteProfile` transaction (updating `user`, `identity`,
`authCredential` to set `deletedAt`, and `device` to set `isActive: false`).

### Schema pattern
```prisma
model User {
  id        String    @id @default(uuid())
  email     String    @unique
  deletedAt DateTime?

  // Index deletedAt alongside the most common other filter, since nearly every
  // query needs "WHERE deletedAt IS NULL" as a baseline filter
  @@index([deletedAt])
}
```

### Why `deletedAt` needs deliberate indexing
Once a table has meaningful soft-deleted row volume, every query filtering on
`deletedAt: null` benefits from `deletedAt` being part of a composite index alongside the
query's other common filter — otherwise PostgreSQL may scan past many deleted rows.

### Unique constraints and soft delete interact badly — design around this explicitly
A plain `@unique` on `email` blocks a new user from registering with an email that belongs to
a soft-deleted account, which is usually wrong behaviour. Use a partial/composite approach:

```prisma
model User {
  id        String    @id @default(uuid())
  email     String
  deletedAt DateTime?

  // Only enforce uniqueness among non-deleted rows
  @@unique([email, deletedAt])
}
```
Note: `@@unique([email, deletedAt])` allows multiple soft-deleted rows with the same email
(since `deletedAt` differs per deletion), but does **not** by itself prevent two *active*
rows — that's exactly the goal, but be aware NULL handling in PostgreSQL composite uniqueness
means each NULL is treated as distinct, so confirm this matches the intended semantics, or use
a Postgres partial unique index via a raw migration if stricter enforcement is needed:
```sql
CREATE UNIQUE INDEX user_email_unique_active ON "User" (email) WHERE "deletedAt" IS NULL;
```
This is the more precise fix when Prisma's declarative `@@unique` can't express "unique only
among active rows" exactly as needed — apply via a custom migration SQL file since Prisma's
schema language doesn't support partial indexes natively (verify against the Prisma version in
use, as this has evolved across versions).

---

## 3. Relation Modeling

### One-to-one (e.g., User ↔ UserProfile, as seen in this project)
```prisma
model User {
  id      String       @id @default(uuid())
  profile UserProfile?
}

model UserProfile {
  id     String @id @default(uuid())
  userId String @unique          // @unique here enforces the one-to-one constraint
  user   User   @relation(fields: [userId], references: [id])
}
```

### One-to-many
```prisma
model User {
  id     String  @id @default(uuid())
  orders Order[]
}

model Order {
  id     String @id @default(uuid())
  userId String
  user   User   @relation(fields: [userId], references: [id])

  @@index([userId])
}
```

### Many-to-many — prefer explicit join model over implicit
Prisma supports implicit many-to-many (auto-generated join table), but prefer an **explicit**
join model when the relationship itself carries data (timestamps, roles, status) or when
direct queries against the join table are needed:

```prisma
// ✅ Explicit join model — queryable, indexable, can carry extra fields
model UserOrganization {
  userId String
  orgId  String
  role   String
  joinedAt DateTime @default(now())

  user User         @relation(fields: [userId], references: [id])
  org  Organization @relation(fields: [orgId], references: [id])

  @@id([userId, orgId])
  @@index([orgId])
}
```

### Cascade behaviour — be deliberate, not default
```prisma
user User @relation(fields: [userId], references: [id], onDelete: Cascade)
```
Given this project's soft-delete convention, `onDelete: Cascade` at the database level is
usually **not** what's wanted for user-related tables — hard-deleting a related row when the
parent is soft-deleted (not hard-deleted) won't trigger anyway, but for any table that *is*
hard-deleted, confirm `Cascade` vs `Restrict` vs `SetNull` matches the actual intended business
behaviour rather than leaving it at Prisma's default.

---

## 4. Migration Safety

### Additive changes — safe to deploy without coordination
- Adding a new nullable column
- Adding a new table
- Adding a new index (consider `CREATE INDEX CONCURRENTLY` on large tables — see below)

### Breaking changes — require a multi-step rollout
- Dropping a column: deploy code that stops reading/writing it first, deploy that, *then* drop
  the column in a later migration — never drop a column the currently-running code still
  references.
- Renaming a column: treat as add-new + backfill + switch reads + drop-old, not an in-place
  rename, to support zero-downtime rolling deploys (multiple app versions briefly running
  simultaneously during a Cloud Run rollout).
- Changing a column type: same multi-step approach — add new column with new type, backfill,
  switch, drop old.
- Adding a `NOT NULL` column to an existing table with data: add as nullable first, backfill,
  then add the `NOT NULL` constraint in a follow-up migration.

### Large table index creation
```sql
-- ❌ Locks the table for writes for the duration of index creation
CREATE INDEX idx_orders_user_id ON "Order" ("userId");

-- ✅ Doesn't block writes, takes longer, can't run inside a transaction
CREATE INDEX CONCURRENTLY idx_orders_user_id ON "Order" ("userId");
```
Prisma migrations run inside a transaction by default, which is incompatible with
`CREATE INDEX CONCURRENTLY`. For large tables in production, write a custom migration with
`prisma migrate dev --create-only`, then manually edit the generated SQL to use
`CONCURRENTLY` and confirm it runs outside an implicit transaction wrapper.

---

## 5. Field Type Choices

- Use `String @db.Uuid` only if the column is genuinely a native Postgres UUID type; Prisma's
  default `String` maps to `text`/`varchar` — confirm which is intended, since native `uuid`
  columns are more compact and slightly faster to index than text-stored UUIDs.
- Use `DateTime @db.Timestamptz` (timestamp with time zone) for all timestamps — never
  `Timestamp` without time zone, to avoid ambiguity across Cloud Run regions/instances.
- Avoid `Json` fields for data that will be queried, filtered, or indexed on a regular basis —
  prefer a proper relation/column so Prisma/Postgres can index and type it. Reserve `Json` for
  genuinely unstructured or rarely-queried metadata.

---

## 6. Schema Review Checklist

- [ ] Every foreign key field used in a frequent `where` clause has a verified index (don't
      assume Prisma's relation auto-indexing applies — check `relationMode` and Prisma version)
- [ ] Composite indexes match actual query filter+sort patterns, with equality columns first
- [ ] `deletedAt` (or equivalent soft-delete column) is indexed on tables using soft delete
- [ ] Unique constraints account for soft-delete semantics (partial unique index where needed)
- [ ] Many-to-many relations with extra data use an explicit join model, not implicit
- [ ] `onDelete` behaviour is deliberate, not left at default, for every relation
- [ ] Breaking schema changes are planned as multi-step migrations, not single-step
- [ ] Large-table index additions use `CREATE INDEX CONCURRENTLY` via a custom migration
- [ ] Timestamps use `@db.Timestamptz`, not timezone-naive types
- [ ] `Json` fields are reserved for genuinely unstructured/rarely-queried data
