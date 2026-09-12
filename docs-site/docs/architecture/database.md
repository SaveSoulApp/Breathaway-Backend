---
sidebar_position: 2
title: Database & Prisma ORM
description: Database architecture, Cloud SQL PostgreSQL, Prisma ORM patterns, connection pooling, and double-entry credit ledger design.
---

# Database & Prisma ORM Architecture

BreathAway utilizes **PostgreSQL** hosted on **Google Cloud SQL** as its primary relational data store, accessed and managed through the **Prisma ORM** in NestJS.

This document details the database architecture, schema design principles, connection pooling, transaction isolation, and the double-entry accounting ledger used for user credits.

---

## 🏛 Database Stack & Topology

```mermaid
graph TD
    Client[API Requests / Cloud Run Instances] --> PgBouncer[Connection Pooler / PgBouncer]
    PgBouncer --> CloudSQL[(GCP Cloud SQL PostgreSQL 16)]
    CloudSQL --> ReadReplica[(Read Replica - Optional Analytics)]
    PrismaService[NestJS PrismaService] --> PgBouncer
```

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Engine** | PostgreSQL 16 | Primary ACID relational database |
| **Hosting** | GCP Cloud SQL | Managed database with automated backups and failover |
| **ORM** | Prisma ORM v6 / v5 | Type-safe query builder, schema modeling, and migrations |
| **Connection Pooling**| Cloud SQL Auth Proxy / PgBouncer | Manages connection limits under stateless autoscaling |
| **Ledger Model** | Double-Entry Bookkeeping | Tamper-evident accounting for user credit balances |

---

## 🔒 Connection Pooling & Stateless Cloud Run

Because the backend runs on GCP Cloud Run with autoscaling (0 to N instances), direct database connections can quickly saturate PostgreSQL's `max_connections`.

1. **Prisma Connection Limit**: Each container instance configures `connection_limit` in the connection URL string:
   ```text
   postgresql://USER:PASSWORD@HOST:PORT/DATABASE?connection_limit=10&pool_timeout=20
   ```
2. **PrismaService Lifecycle**: `PrismaService` implements `OnModuleInit` and `OnModuleDestroy` to cleanly connect on startup and disconnect during graceful container termination.
3. **Prepared Statements**: When using transaction-mode pooling (e.g. PgBouncer), prepared statements are managed using `pgbouncer=true` query parameter to avoid transaction collisions.

---

## 🛡 Prisma ORM Patterns & Best Practices

### 1. Dedicated Service Isolation
Controllers **never** inject `PrismaService` directly. All database access must be encapsulated within domain Services or Repositories:

```typescript
// ❌ Anti-pattern: Direct Prisma access in Controller
@Controller('users')
export class UserController {
  constructor(private readonly prisma: PrismaService) {}
}

// ✅ Recommended: Service encapsulating business and data logic
@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}
}
```

### 2. Preventing N+1 Query Problems
Prisma provides fluent relational queries. Always use explicit `select` or `include` rather than querying related entities in iterative loops:

```typescript
// ✅ Optimized query fetching user with verified identity and active preferences
const user = await this.prisma.user.findUnique({
  where: { id: userId },
  include: {
    identity: {
      select: { id: true, verificationStatus: true, emailVerified: true },
    },
    preferences: true,
  },
});
```

### 3. Atomic Multi-Record Mutations ($transaction)
For any operation modifying multiple dependent tables, use Prisma's `$transaction` API to maintain strict ACID invariants:

```typescript
await this.prisma.$transaction(async (tx) => {
  // 1. Mark like as mutual
  const match = await tx.match.create({
    data: { userAId, userBId, status: MatchStatus.ACTIVE },
  });

  // 2. Initialize chat channel
  await tx.chatChannel.create({
    data: { matchId: match.id, type: ChannelType.DIRECT },
  });

  return match;
});
```

---

## 💰 Double-Entry Credit Ledger Architecture

User credits (used for premium actions, super-likes, and profile boosts) are modeled as a **double-entry ledger** to ensure financial auditability and prevent balance drift.

### Core Data Models
- **`CreditAccount`**: Represents a user's balance container (`AVAILABLE`, `ESCROW`, `LOCKED`).
- **`CreditLedgerEntry`**: Immutable transaction log recording every debit (`DEBIT`) and credit (`CREDIT`) with signed amounts and operational metadata (`txType`, `idempotencyKey`).

```mermaid
sequenceDiagram
    participant Client
    participant Service as CreditsService
    participant DB as Cloud SQL (Prisma $transaction)

    Client->>Service: Spend Credits (action: SUPER_LIKE, idempotencyKey)
    Service->>DB: Check idempotency record
    Service->>DB: Verify available balance >= amount
    Service->>DB: Insert CreditLedgerEntry (DEBIT)
    Service->>DB: Update CreditAccount (balance -= amount)
    DB-->>Service: Commit Transaction
    Service-->>Client: Updated Balance & Ledger Reference
```

---

## 🔄 Migration & Schema Evolution Guidelines

- **Schema Source of Truth**: `prisma/schema.prisma` defines models, indexes, relations, and enums.
- **Migration Generation**: Local migration creation via:
  ```bash
  npx prisma migrate dev --name descriptive_migration_name
  ```
- **Production Migrations**: Executed in CI/CD before deploying new Cloud Run container revisions:
  ```bash
  npx prisma migrate deploy
  ```
- **Zero-Downtime Rule**: Never drop or rename columns in a single release. Follow expand-contract deployment (add column -> dual write -> backfill -> switch read -> deprecate old column).
