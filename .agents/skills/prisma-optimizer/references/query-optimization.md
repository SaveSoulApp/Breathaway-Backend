# Query Optimization Guidelines

Reference for avoiding N+1 queries, field selection discipline, pagination, and transaction
patterns in Prisma against PostgreSQL (Cloud SQL).

---

## 1. The N+1 Problem — Detection and Fixes

### What it looks like
Any pattern where a list is fetched, then a related entity is fetched **per item** in a
subsequent loop or `Promise.all`.

```typescript
// ❌ N+1 — 1 query for orders + N queries for each order's user
const orders = await prisma.order.findMany();
const ordersWithUsers = await Promise.all(
  orders.map(async (order) => ({
    ...order,
    user: await prisma.user.findUnique({ where: { id: order.userId } }),
  })),
);
```

Wrapping the per-item queries in `Promise.all` does **not** fix N+1 — it parallelizes the N
queries instead of running them sequentially, but it's still N+1 round trips to the database
instead of one. Flag this pattern exactly the same as a sequential loop.

### Fix: nested select/include in the original query
```typescript
// ✅ Single query, relation joined at the DB level
const orders = await prisma.order.findMany({
  select: {
    id: true,
    total: true,
    user: { select: { id: true, name: true, email: true } },
  },
});
```

### Fix: batch with `findMany` + `where: { in: [...] }` when nested select isn't viable
If the relation can't be expressed as a direct Prisma relation (e.g., a computed lookup, or
data from a different bounded context per the `clean-architecture-expert` module boundaries),
batch-fetch by collecting IDs first, then a single `in` query:

```typescript
// ✅ Two queries total, not N+1
const orders = await prisma.order.findMany();
const userIds = [...new Set(orders.map((o) => o.userId))];
const users = await prisma.user.findMany({
  where: { id: { in: userIds } },
  select: { id: true, name: true, email: true },
});
const usersById = new Map(users.map((u) => [u.id, u]));
const ordersWithUsers = orders.map((o) => ({ ...o, user: usersById.get(o.userId) }));
```

### Where N+1 commonly hides
- GraphQL resolvers resolving a relation field per parent (use DataLoader-style batching, or
  Prisma's nested select if the whole query can be planned upfront).
- Event listeners that re-fetch the triggering entity's relations one at a time when handling
  a batch of events.
- Repository methods that accept a list of IDs but internally loop and call a single-ID method
  N times instead of exposing a proper `findManyByIds` using `where: { in: ids }`.

---

## 2. Field Selection Discipline

### `select` vs `include` — pick deliberately, not by habit

| | Fetches | Use when |
|---|---|---|
| `select` | Only the listed fields/relations | You know exactly which fields are needed (almost always — default to this) |
| `include` | All scalar fields + the specified relations | The full related row is genuinely needed downstream |
| Bare `findMany()` / `findUnique()` | All scalar fields, no relations | Rarely correct — usually should be `select` |

```typescript
// ❌ Fetches every column, including ones never used in the response
const user = await prisma.user.findUnique({ where: { id } });
return { id: user.id, email: user.email };  // fetched 10 columns, used 2

// ✅ Fetch exactly what's used
const user = await prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true },
});
```

### Never select sensitive fields unless explicitly needed
```typescript
// ❌ passwordHash fetched even though it's never used in this code path
const user = await prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true, passwordHash: true },
});

// ✅ Only fetch passwordHash in the one code path that actually compares it (login)
const user = await prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true },
});
```
This is both a performance and a security discipline — narrow `select` reduces the blast
radius of any future bug that accidentally serializes the fetched object into a response.

### Nested select for relations
```typescript
const profile = await prisma.userProfile.findUnique({
  where: { userId },
  select: {
    firstName: true,
    lastName: true,
    user: {
      select: { email: true },  // only email from the related user, not the whole row
    },
  },
});
```

---

## 3. Pagination

### Offset-based (`take`/`skip`) — simple, fine for small/admin-facing lists
```typescript
async findAll(query: UserQueryDto) {
  const { page = 1, limit = 20 } = query;
  const [data, total] = await prisma.$transaction([
    prisma.user.findMany({
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, email: true, name: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count(),
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}
```
Wrapping the data query and the count in `$transaction` (as a batch, not interactive) ensures
both reflect the same consistent snapshot and executes as a single round trip pair.

**Limitation:** offset pagination degrades on large tables — `skip: 100000` still requires the
database to scan and discard 100,000 rows. Avoid offset pagination on tables expected to grow
past roughly 10,000–50,000 rows per typical query scope, or on any infinite-scroll-style
user-facing feed.

### Cursor-based — required for large or fast-growing datasets
```typescript
async findAllCursor(cursor?: string, limit = 20) {
  const items = await prisma.order.findMany({
    take: limit + 1,                         // fetch one extra to know if there's a next page
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),  // skip the cursor item itself
    orderBy: { id: 'asc' },
    select: { id: true, total: true, createdAt: true },
  });

  const hasNextPage = items.length > limit;
  const data = hasNextPage ? items.slice(0, -1) : items;
  const nextCursor = hasNextPage ? data[data.length - 1].id : null;

  return { data, nextCursor, hasNextPage };
}
```
Cursor pagination requires a stable, unique, indexed sort column (`id` with `@default(uuid())`
works, but verify ordering by UUID is acceptable — if insertion order matters, use a
monotonically increasing column like `createdAt` combined with `id` as a tiebreaker).

### Always require a `limit` ceiling
Never let a client request an unbounded `limit`. Validate it server-side:
```typescript
@IsOptional()
@Type(() => Number)
@IsInt()
@Max(100)
limit?: number = 20;
```

---

## 4. Transactions

### When required
Any operation where multiple writes must succeed or fail together to preserve a business
invariant — not just "writes that happen to be related."

### Interactive transactions (preferred for conditional/sequential logic)
```typescript
await prisma.$transaction(async (tx) => {
  const order = await tx.order.create({ data: orderData });
  await tx.inventory.update({
    where: { productId: orderData.productId },
    data: { stock: { decrement: orderData.quantity } },
  });
  if (order.total > 1000) {
    await tx.auditLog.create({ data: { event: 'large_order', orderId: order.id } });
  }
  return order;
});
```

### Batch transactions (for independent operations executed together)
```typescript
// All-or-nothing, but no inter-dependency or conditional logic between them
const [users, total] = await prisma.$transaction([
  prisma.user.findMany({ take: 20 }),
  prisma.user.count(),
]);
```
Use the array form only when operations don't depend on each other's results — use the
callback form whenever one write's outcome determines the next.

### Transaction timeout
Default Prisma transaction timeout is 5 seconds. For transactions involving external calls
(never put an external HTTP call inside a DB transaction) or unusually large batch writes,
this is a signal to break the operation up, not to just raise the timeout — long-held
transactions hold row/table locks and hurt concurrent throughput.

```typescript
// ❌ Never call out to an external API inside a transaction
await prisma.$transaction(async (tx) => {
  await tx.order.create({ data: orderData });
  await stripeClient.charges.create({ ... });  // external call holding a DB transaction open
});

// ✅ Persist first, then trigger the external call, with compensation logic for failure
const order = await prisma.order.create({ data: orderData });
try {
  await stripeClient.charges.create({ ... });
} catch (error) {
  await prisma.order.update({ where: { id: order.id }, data: { status: 'PAYMENT_FAILED' } });
  throw error;
}
```

---

## 5. Detecting Slow Queries

- Enable Prisma's query logging in non-production environments to spot N+1 patterns during
  development: `log: ['query']` in `PrismaClient` instantiation.
- For production, use Cloud SQL's Query Insights (GCP console) to identify slow queries by
  actual execution time and frequency — don't rely solely on local dev observations.
- For a suspected slow query, run `EXPLAIN ANALYZE` via `prisma.$queryRaw` during
  investigation to confirm whether an index is being used or a sequential scan is occurring:
  ```typescript
  const plan = await prisma.$queryRaw`EXPLAIN ANALYZE SELECT * FROM "User" WHERE email = ${email}`;
  ```
