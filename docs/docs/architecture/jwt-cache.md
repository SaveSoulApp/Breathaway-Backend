---
sidebar_position: 5
title: Redis JWT Active Session Caching
description: Sub-millisecond JWT active status validation, multi-device Redis Set architecture, atomic pipelining, and database connection pool offloading.
---

# Redis JWT Active Session Caching & Pool Offloading

This guide details the dual-layer authentication caching architecture of the BreathAway backend. By combining stateless cryptographic JWT verification with stateful, in-memory **Redis Sets**, the system offloads 96.7% of authentication queries from PostgreSQL, slashes warm authorization latency by 89.9%, and supports seamless multi-device sessions with targeted device revocation.

---

## 1. Problem Statement & Motivation

In a containerized, serverless architecture running on **Google Cloud Run** fronting **Google Cloud SQL (PostgreSQL)**, protecting database connection headroom is a paramount engineering priority:

```mermaid
graph LR
    subgraph CloudRun["Cloud Run (Horizontal Autoscaling 0 to N)"]
        Instance1["Instance 1 (DB_POOL_MAX = 4)"]
        Instance2["Instance 2 (DB_POOL_MAX = 4)"]
        InstanceN["Instance N (DB_POOL_MAX = 4)"]
    end

    subgraph Bottleneck["Database Saturation Risk"]
        DB[("Cloud SQL PostgreSQL<br/>max_connections limit")]
    end

    Instance1 & Instance2 & InstanceN -->|"30 requests = 30 DB checkouts (~11.5ms each)"| DB
```

### The Architectural Challenge

1. **Repetitive Read Pressure**: Every incoming HTTP request to a protected endpoint passes through `JwtAuthGuard`. Under standard stateless JWT patterns with database existence verification, each request executes:
   ```sql
   SELECT * FROM "User" WHERE id = $1 AND "deletedAt" IS NULL;
   ```
2. **Socket Pool Saturation**: Each Cloud Run container maintains a strictly bounded Node-Postgres connection pool (`DB_POOL_MAX = 4`). High-frequency API bursts (such as rapid swipe evaluations, feed pagination, or discovery card refreshes) exhaust available socket slots on read-only user lookups, triggering connection pool contention warnings (`waitingCount > 0`).
3. **Elevated Route Latency**: A PostgreSQL query over the network or Cloud SQL Auth Proxy introduces an average roundtrip latency of **~11.5 ms** per authenticated request.

---

## 2. Dual-Layer Architecture & System Topology

To eliminate database contention while maintaining immediate revocability, BreathAway implements a **Dual-Layer Authentication Pipeline**:

```mermaid
flowchart TD
    Client["Client Application (Mobile / Web)"] -->|"Bearer <access_token>"| API["Google Cloud Run (backend-service)"]

    subgraph AuthPipeline["JwtAuthGuard / JwtStrategy Validation Pipeline"]
        Crypto["1. Passport JWT Verify<br/>• Cryptographic signature<br/>• Audience (breathaway-api)<br/>• Expiration (exp)"]
        CacheCheck{"2. Redis Set Check<br/>SISMEMBER user:active:userId jti"}
        RevokeCheck{"3. Blacklist Check<br/>EXISTS auth:revoked:jti"}
        DBFallback["4. Cloud SQL Fallback<br/>prisma.user.findUnique"]
        WarmPipeline["5. Atomic Pipeline<br/>saddWithExpire (TTL 300s)"]
    end

    subgraph Storage["Infrastructure Layer"]
        Redis[("Upstash Redis Cache<br/>In-Memory Sets")]
        Postgres[("Cloud SQL PostgreSQL<br/>Primary ACID Store")]
    end

    API --> Crypto
    Crypto --> CacheCheck
    CacheCheck -- "Set Hit (1)<br/>~1.16ms" --> Authorized["200 OK: Controller Invoked"]
    CacheCheck -- "Set Miss (0)" --> RevokeCheck
    RevokeCheck -- "Revoked (1)" --> Revoked401["401 Unauthorized: Session Revoked<br/>(Zero DB Queries)"]
    RevokeCheck -- "Not Revoked (0)" --> DBFallback
    DBFallback --> Postgres
    Postgres --> WarmPipeline
    WarmPipeline --> Redis
    WarmPipeline --> Authorized

    CacheCheck -.-> Redis
    RevokeCheck -.-> Redis
```

---

## 3. The Single-Key Redis Set Architecture (`user:active:<userId>`)

### Why a Redis Set Instead of a Simple Key-Value String?

A naive caching approach uses a simple string key representing the user's active session:

```redis
# ❌ Anti-Pattern: Single String Key Overwrites Concurrent Devices
SET user:active:01KY9DY8M1GARMFEHXFJBZ08RM "jti_iphone_123"
```

If a user logs into their iPhone and subsequently opens the BreathAway web portal on their MacBook, setting a new string key would **overwrite** the iPhone's `jti`. The iPhone's next API request would experience a cache miss, causing continuous cache thrashing and database fallbacks.

### The Solution: Non-Destructive Redis Sets

BreathAway models active user sessions as a **Redis Set** indexed by user ID:

- **Key Pattern**: `user:active:<userId>`
- **Set Members**: Active access token `jti` strings (`nanoid(32)`).
- **Concurrency Support**: Each device's access token `jti` is appended via `SADD`. Both the iPhone and MacBook tokens reside concurrently within the same set.
- **$O(1)$ Time Complexity**: Validating whether an incoming token is active requires a single set membership check (`SISMEMBER user:active:<userId> <jti>`), executing in **~1.16 ms**.

```redis
# ✅ Recommended: Multi-Device Set Storage
SADD user:active:01KY9DY8M1GARMFEHXFJBZ08RM "jti_iphone_aaa111"
SADD user:active:01KY9DY8M1GARMFEHXFJBZ08RM "jti_macbook_bbb222"
```

---

## 4. Atomic Pipelined Insertion (`saddWithExpire`)

Updating a Redis Set and refreshing its Time-To-Live (TTL) typically requires two separate roundtrips:

1. `SADD user:active:<userId> <jti>`
2. `EXPIRE user:active:<userId> 300`

Executing these sequentially over the network would incur two network roundtrips. To optimize throughput, `RedisService.saddWithExpire` leverages **Redis Command Pipelining**:

```typescript
// src/infrastructure/redis/redis.service.ts
async saddWithExpire(key: string, member: string, ttlSeconds: number): Promise<void> {
  const pipeline = this.redisClient.pipeline();
  pipeline.sadd(key, member);
  pipeline.expire(key, ttlSeconds);
  await pipeline.exec();
}
```

### Performance & Safety Guarantees

- **Single TCP Roundtrip**: Dispatches both commands in a single network packet, halving cache write latency.
- **Sliding TTL Refresh**: Every time a fresh device logs in or a cold token is refreshed from the database, the set's sliding 5-minute TTL is renewed.
- **Defensive Duration Guard**: `JwtAuthCacheService` enforces positive integer TTLs. If `JWT_CACHE_TTL_SECONDS` is unconfigured, zero, negative, or `NaN`, the service automatically defaults to `DEFAULT_JWT_CACHE_TTL_SECONDS = 300`, preventing unbounded key persistence in Redis.

---

## 5. Session Revocation & Invalidation Mechanics

A critical challenge with caching authentication state is ensuring immediate, reliable revocation during security events without requiring distributed database writes.

```mermaid
flowchart TD
    Event["User Action / Security Event"] --> Type{Event Type}

    Type -- "Targeted Signout<br/>(Specific Device)" --> Single["1. SREM user:active:userId accessJti<br/>2. SET auth:revoked:accessJti 1 (EX 900s)<br/>3. Revoke UserSession in Postgres"]
    Type -- "Global Logout<br/>(All Devices)" --> Global["1. DEL user:active:userId<br/>2. Revoke all UserSessions in Postgres"]
    Type -- "Account Deletion<br/>(GDPR / User Teardown)" --> Delete["1. DEL user:active:userId<br/>2. Cascade delete database entities"]
    Type -- "Account Soft-Delete / Ban" --> Ban["1. DEL user:active:userId<br/>2. Set deletedAt / isBlocked in Postgres"]

    Single --> SingleResult["Signed-out device blocked immediately.<br/>Other devices remain warm in Redis!"]
    Global --> GlobalResult["All active devices disconnected instantly."]
    Delete --> DeleteResult["All user cache records purged."]
    Ban --> BanResult["User rejected at both cache and DB layers."]
```

### 1. Targeted Single-Device Signout

When a user logs out from one device (e.g., logging out of a shared tablet while remaining logged in on their phone):

1. The client invokes `POST /api/v1/auth/signout` with its `refreshToken`.
2. `AuthController` extracts the active access token's `jti` via the `@CurrentJti()` route parameter decorator:
   ```typescript
   @Post('signout')
   async signout(
     @CurrentUserId() userId: string,
     @CurrentJti() accessJti?: string,
     @Body() dto?: SignoutRequestDto,
   ): Promise<void> {
     await this.authService.signout(userId, dto, accessJti);
   }
   ```
3. `JwtAuthCacheService.removeToken(userId, accessJti)` executes `SREM user:active:<userId> <accessJti>`.
4. `JwtAuthCacheService.revokeAccessToken(accessJti)` creates an immediate blacklist marker:
   - **Key**: `auth:revoked:<accessJti>`
   - **Value**: `'1'`
   - **TTL**: 15 minutes (`REVOKED_TOKEN_TTL_SECONDS = 900`, matching access token lifespan).
5. **Outcome**: The user's other devices remain untouched and warm in Redis. The signed-out device is rejected immediately if it attempts to reuse its access token.

### 2. Global Signout

When `POST /api/v1/auth/signout` is called without a `refreshToken`:

1. `AuthTokenService` invalidates all database refresh sessions for that user.
2. `JwtAuthCacheService.revokeUser(userId)` executes `DEL user:active:<userId>`.
3. All devices are immediately evicted from the warm cache. Any subsequent request from any device triggers a database lookup, which detects that sessions are revoked.

### 3. Account Deletion & Soft-Delete Synchronization

When an account is deleted via `DELETE /api/v1/auth/me` or soft-deleted by an administrator:

1. `AuthService.deleteAccount` emits `USER_DELETED_EVENT` (`UserDeletedEvent`).
2. The asynchronous event listener invokes `JwtAuthCacheService.revokeUser(userId)`.
3. The user's active session set is purged from Redis (`DEL user:active:<userId>`), preventing any dangling access tokens from succeeding.

---

## 6. The 4-Step `JwtStrategy` Verification Sequence

The complete verification sequence executed on every authenticated request is illustrated below:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Mobile / Web Client
    participant Guard as JwtAuthGuard
    participant Strat as JwtStrategy
    participant Cache as JwtAuthCacheService
    participant Redis as Upstash Redis
    participant Prisma as Cloud SQL PostgreSQL

    Client ->> Guard: GET /api/v1/matches (Bearer <token>)
    activate Guard
    Guard ->> Strat: validate(req, payload: { sub, email, jti })
    activate Strat

    Note over Strat: Step 1: Cryptographic signature verified by Passport

    Strat ->> Cache: isUserActive(userId, jti)
    activate Cache
    Cache ->> Redis: SISMEMBER user:active:<userId> <jti>
    activate Redis
    Redis -->> Cache: 1 (Hit) or 0 (Miss)
    deactivate Redis
    Cache -->> Strat: Cache status
    deactivate Cache

    alt Step 2: Warm Cache Hit (~1.16ms)
        Note over Strat: ✅ Cache Hit: User active in Redis Set<br/>Zero database queries executed
        Strat -->> Guard: Return { userId, email, jti }
        Guard -->> Client: 200 OK (Proceed to controller)
    else Cache Miss
        Strat ->> Cache: isTokenRevoked(jti)
        activate Cache
        Cache ->> Redis: EXISTS auth:revoked:<jti>
        activate Redis
        Redis -->> Cache: 1 (Revoked) or 0 (Not Revoked)
        deactivate Redis
        Cache -->> Strat: Revocation status
        deactivate Cache

        alt Step 3: Token Explicitly Revoked
            Note over Strat: 🚨 Revoked access token presented!<br/>Zero database queries executed
            Strat -->> Guard: 401 Unauthorized ("Session has been revoked")
            Guard -->> Client: 401 Unauthorized
        else Step 4: Token Not Revoked (Cold Start / TTL Expiry)
            Strat ->> Prisma: findUnique({ where: { id: userId, deletedAt: null } })
            activate Prisma
            Prisma -->> Strat: User record or null
            deactivate Prisma

            alt User Inactive or Soft-Deleted
                Strat -->> Guard: 401 Unauthorized ("User inactive or deleted")
                Guard -->> Client: 401 Unauthorized
            else User Active & Healthy
                Strat ->> Cache: addToken(userId, jti)
                activate Cache
                Note over Cache, Redis: Atomic Pipelined Roundtrip (saddWithExpire)
                Cache ->> Redis: SADD user:active:<userId> <jti> + EXPIRE 300s
                activate Redis
                Redis -->> Cache: OK
                deactivate Redis
                Cache -->> Strat: Warm cache populated
                deactivate Cache

                Strat -->> Guard: Return { userId, email, jti }
                Guard -->> Client: 200 OK (Proceed to controller)
            end
        end
    end
    deactivate Strat
    deactivate Guard
```

---

## 7. Fail-Safe Resilience, Network Timeouts & Feature Flags

Production architectures must never let a cache failure cascade into an API outage. BreathAway implements multi-layered fault tolerance:

### 1. Instant Kill-Switch (`JWT_CACHE_ENABLED`)

- Controlled via environment configuration: `JWT_CACHE_ENABLED` (boolean, default: `true`).
- When set to `false`, `JwtAuthCacheService.isUserActive` immediately returns `false` without connecting to Redis.
- All requests fall back cleanly to direct PostgreSQL lookups (`prisma.user.findUnique`), identical to the legacy validation pipeline.

### 2. Network Timeouts & Bounded Sockets on Cloud Run

In serverless Cloud Run environments, hanging network calls can exhaust request execution budgets. To ensure absolute resilience:

- **Connect Timeout (`REDIS_CONNECT_TIMEOUT_MS = 5000`)**: If the initial TCP socket connection to Upstash Redis or Cloud Memorystore does not complete within 5 seconds, the client fails fast.
- **Command Timeout (`REDIS_COMMAND_TIMEOUT_MS = 3000`)**: Individual read/write operations (like `SISMEMBER` or `saddWithExpire`) are capped at 3,000 ms. If a network partition occurs mid-request, the command aborts cleanly.
- **TCP Keep-Alive (`keepAlive = 10000`)**: Proactively maintains socket liveness and purges stale serverless connections.
- **Graceful Fallback**: `JwtAuthCacheService` wraps all operations in `try/catch`. On timeout or network rejection, it logs a warning, emits `AUTH_CACHE_FALLBACK`, and returns `false`, enabling `JwtStrategy` to resolve the user via PostgreSQL without dropping requests.

### 3. Integration Testing Verification

The test suite in `src/modules/auth/tests/jwt.strategy.spec.ts` explicitly includes end-to-end integration tests that mock `RedisService` throwing `ETIMEDOUT` and `ECONNREFUSED` errors across both read and write paths. These tests assert that `JwtStrategy` falls back to `prisma.user.findFirst`, authenticates healthy users, and rejects deleted users with 401 without crashing or hanging.

---

## 8. Telemetry Pipeline & Production Monitoring

To monitor cache effectiveness in production without third-party APM overhead, `JwtAuthCacheService` emits typed structured log events through `LoggerService`:

```mermaid
flowchart LR
    Cache["JwtAuthCacheService"] -->|"logger.event()"| Pino["Structured JSON Log"]
    Pino -->|"stdout"| CloudRun["GCP Cloud Run"]
    CloudRun -->|"Log Router"| LogMetrics["Cloud Monitoring (Log-Based Counter Metrics)"]
    CloudRun -->|"Log Router Sink"| BigQuery["BigQuery Data Warehouse"]

    LogMetrics --> Alert["SRE Dashboard: Cache Hit Rate (%)"]
    BigQuery --> Analytics["SQL Diagnostic & Performance Queries"]
```

### Emitted Telemetry Events

| Log Event Constant                | Event Name                      | Severity | Trigger Condition                                                   |
| :-------------------------------- | :------------------------------ | :------: | :------------------------------------------------------------------ |
| `LOG_EVENT.AUTH_CACHE_HIT`        | `AUTH_CACHE_HIT`                |  `INFO`  | Access token `jti` verified in Redis Set ($O(1)$ sub-millisecond).  |
| `LOG_EVENT.AUTH_CACHE_MISS`       | `AUTH_CACHE_MISS`               |  `INFO`  | Token not found in Redis Set; triggers DB lookup fallback.          |
| `LOG_EVENT.AUTH_CACHE_FALLBACK`   | `AUTH_CACHE_FALLBACK`           |  `WARN`  | Redis timeout, network failure, or cache disabled via feature flag. |
| `LOG_EVENT.AUTH_CACHE_REVOCATION` | `AUTH_CACHE_REVOCATION_BLOCKED` |  `WARN`  | Blocked request presenting an explicitly revoked access token JTI.  |

### BigQuery Cache Performance Query

Operators can query real-time cache hit rates and fallback frequencies in BigQuery:

```sql
SELECT
  JSON_VALUE(json_payload, '$.event') AS auth_event,
  COUNT(*) AS total_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS percentage
FROM `breathaway-development.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') IN ('AUTH_CACHE_HIT', 'AUTH_CACHE_MISS', 'AUTH_CACHE_FALLBACK')
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
GROUP BY auth_event;
```

---

## 9. Empirical Benchmark Performance & Latency Analysis

To quantify the operational benefits, benchmarks were executed comparing 30 consecutive authenticated requests within a 3-minute window with caching enabled versus disabled:

| Benchmark Dimension              | Direct Database (Cache Disabled) | Redis Active Set (Cache Enabled) | Operational Gain                    |
| :------------------------------- | :------------------------------: | :------------------------------: | :---------------------------------- |
| **Warm Route Latency**           |             ~11.5 ms             |             ~1.16 ms             | **89.9% Latency Reduction** (~10x)  |
| **PostgreSQL Queries (30 req)**  |            30 queries            |             1 query              | **96.7% Database Query Drop**       |
| **Pool Connections Checked Out** |           30 checkouts           |            1 checkout            | **Prevents Connection Contention**  |
| **Multi-Device Support**         |               Yes                |               Yes                | **Non-destructive Set storage**     |
| **Granular Device Revocation**   |             Partial              |            Full O(1)             | **SREM + 15m Blacklist Protection** |

### Latency Comparison Breakdown

```
Direct PostgreSQL: [=========== 11.5 ms ===========]
Redis Active Set:  [= 1.16 ms =] (89.9% faster)
```

The initial cold request pays the standard 11.5 ms PostgreSQL lookup cost to verify user existence and populate the Redis Set. All subsequent 29 requests resolve in **1.16 ms**, completely bypassing PostgreSQL and preserving Cloud SQL socket capacity for transactional writes.

---

## 10. Configuration Reference

| Environment Variable       | Type    | Default | Required | Description                                                                                                          |
| :------------------------- | :------ | :-----: | :------: | :------------------------------------------------------------------------------------------------------------------- |
| `JWT_CACHE_ENABLED`        | Boolean | `true`  |    No    | Feature flag to toggle Redis JWT active session caching. When `false`, all validations route directly to PostgreSQL. |
| `JWT_CACHE_TTL_SECONDS`    | Number  |  `300`  |    No    | Sliding TTL for active session sets (in seconds). Defaults to 300 (5 minutes) if set to 0, negative, or `NaN`.       |
| `REDIS_CONNECT_TIMEOUT_MS` | Number  | `5000`  |    No    | TCP connect timeout in milliseconds for the Redis client on Cloud Run.                                               |
| `REDIS_COMMAND_TIMEOUT_MS` | Number  | `3000`  |    No    | Execution timeout in milliseconds for individual Redis read/write commands.                                          |
| `REDIS_URL`                | String  |    —    |   Yes    | Full Redis connection URI (e.g., `redis://default:token@host:6379`).                                                 |

---

## 11. Production Best Practices & SRE Guidelines

1. **TTL Alignment & Active Session Window**:
   - `JWT_CACHE_TTL_SECONDS` (default: `300`s / 5 minutes) represents the sliding active-session window during which positive status is served directly from Redis without checking PostgreSQL.
   - Even though access tokens have a 15-minute validity (`JWT_EXPIRES_IN = 15m`), the 5-minute cache TTL deliberately bounds the detection window for out-of-band administrative actions (such as direct database deactivations or status modifications) to at most 5 minutes.
   - Active users make at most 3 database verification checks across their token's entire 15-minute lifetime (saving >96% of repetitive queries).
   - If zero intermediate database lookups are desired, operators can align `JWT_CACHE_TTL_SECONDS=900` to match `JWT_EXPIRES_IN`.

2. **Redis Memory Eviction Policy (`maxmemory-policy`)**:
   - Because active tokens are stored as Sets with TTLs, ensure your Redis instance (Cloud Memorystore or Upstash) is configured with an LRU eviction policy:
     ```redis
     maxmemory-policy volatile-lru
     ```
   - `volatile-lru` ensures that under extreme memory pressure, Redis evicts the least recently used keys with an expiring TTL first, preserving non-expiring configuration data and preventing `OOM command not allowed` exceptions.

3. **Always Use Sets for Multi-Device Authentication**: Never store device JTIs in a single string key per user. Sets ensure concurrent logins from multiple devices remain active without cache thrashing.

4. **Pipeline SADD and EXPIRE**: Always use `saddWithExpire` to combine set additions and TTL extensions into a single TCP roundtrip.

5. **Blacklist Revoked Access Tokens**: When performing targeted signout, combine `SREM` with an immediate 15-minute revocation key (`auth:revoked:<jti> = 1`) to reject replayed tokens without querying PostgreSQL.
