---
sidebar_position: 2
---

# API Authentication & Guards

BreathAway APIs are secured using four distinct authentication layers depending on the caller type:

1. **Client Identity Verification**: Ensures requests originate from a supported, authentic version of the mobile app.
2. **User Session Authentication**: Authenticates and identifies the logged-in user via JWT tokens.
3. **Internal GCP Service Authentication (OIDC)**: Authenticates automated service-to-service calls from GCP infrastructure (Cloud Scheduler and Pub/Sub) using Google-signed OpenID Connect ID tokens.
4. **Administrative & Developer Authentication (Google OIDC + GCP IAM)**: Authenticates engineers and administrators invoking privileged routes using personal Google accounts verified against live GCP project IAM policies.

---

## 📱 1. Client Identity Verification

Enforced globally by [`ClientIdentityGuard`](file:///src/common/guards/client-identity.guard.ts) on all incoming client requests. It can be bypassed on specific routes (such as system webhooks or internal cloud tasks) by applying the `@SkipClientIdentity()` decorator.

### Required Ingress Request Headers

Every standard client request must supply the following custom headers:

| Header Name    | Type   | Description                                                                                                                                              | Example                                 |
| :------------- | :----- | :------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------- |
| `x-api-key`    | String | Valid API key configured for the requesting platform in `API_KEYS`.                                                                                      | `e5f6a7b8-c9d0-4123-d3ef-123456789012`  |
| `x-client-id`  | String | Valid Client Identifier configured for the requesting platform in `CLIENT_IDS`.                                                                          | `f6a7b8c9-d0e1-4234-e4fa-234567890123`  |
| `x-device-id`  | String | Unique device identifier (persisted for push notification bindings and user session security audits).                                                    | `A12B34CD-56EF-4012-9A8B-CDEF12345678`  |
| `x-user-agent` | String | Custom app metadata string or omitted for standard browser ingress. (See [Platform User-Agent Resolution](#platform-user-agent-resolution-rules) below). | `BreathAway/1.0.0 (iOS 17.5; iPhone15)` |

---

### 🛡️ Platform-Keyed Identity & Guardrails

To prevent client impersonation and cross-platform key leakage, `API_KEYS` and `CLIENT_IDS` in Secret Manager / configuration are structured strictly as platform-keyed JSON objects:

```json
{
  "android": ["<android-uuid-1>", "<android-uuid-2>"],
  "ios": ["<ios-uuid-1>"],
  "web": ["<web-uuid-1>"],
  "postman": ["<postman-uuid-1>"]
}
```

#### Core Verification Guardrails:

1. **Authoritative Platform Resolution**: The client's operational platform is resolved authoritatively from `x-client-id` (`keyPlatformMap.get(clientId)`).
2. **Symmetrical Key-Platform Alignment**: The `x-api-key`'s registered platform is compared against the resolved `x-client-id` platform. If a mismatch is detected (e.g. an Android API key passed with a Web Client ID), the request is immediately rejected with HTTP `401 Unauthorized` (`API Key platform (android) does not match Client ID platform (web)`).
3. **Whitelisted Platform Checking ($O(1)$)**: The resolved platform is validated against `REQUIRED_PLATFORMS` (configured in lowercase: `["ios", "android", "web", "postman"]`). Pre-normalized into an internal `Set<string>` at startup for instant $O(1)$ verification without per-request memory allocation.
4. **Configuration Collision Guardrail**: During startup parsing, if a key is accidentally duplicated across multiple platforms in Secret Manager, `ClientIdentityGuard` emits a structured warning to Cloud Logging with the masked key (`keyMasked: "d290..."`) and locks the key to its first-declared platform, preventing silent overwrites.

---

### 🧭 Platform User-Agent Resolution Rules

User-Agent headers are resolved via [`UserAgentUtils.resolveCanonicalUserAgent`](file:///src/common/utils/user-agent.utils.ts), prioritizing `x-user-agent` for native mobile apps and standard `user-agent` for web browsers:

| Platform      | Permitted User-Agent Formats                                                                                                                            | Version Gate (`MIN_APP_VERSION`)                      | App Name Gate (`APP_NAME`)            | Resolved Device Model / OS Metadata                                              |
| :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------- | :------------------------------------ | :------------------------------------------------------------------------------- |
| **`ios`**     | `AppName/Version (iOS OSVersion; DeviceModel)`                                                                                                          | **Enforced** ($\ge$ `MIN_APP_VERSION`)                | **Enforced** (`AppName === APP_NAME`) | Extracted directly from custom format tokens.                                    |
| **`android`** | `AppName/Version (Android OSVersion; DeviceModel)`                                                                                                      | **Enforced** ($\ge$ `MIN_APP_VERSION`)                | **Enforced** (`AppName === APP_NAME`) | Extracted directly from custom format tokens.                                    |
| **`web`**     | 1. Standard browser `user-agent` (`Mozilla/5.0...`)<br/>2. Node.js SSR runtime (`node`)<br/>3. Synthetic placeholder (`AppName/Version (Web ...; ...)`) | **Bypassed** (Defaults to `1.0.0`)                    | **Bypassed**                          | Parsed via `ua-parser-js`. Node.js SSR resolves to `Node.js Server` / `Node.js`. |
| **`postman`** | 1. Native Postman runtime (`PostmanRuntime/7.x.x`)<br/>2. Custom developer header strings<br/>3. Synthetic placeholder format                           | **Bypassed** (Defaults to runtime version or `1.0.0`) | **Bypassed**                          | Resolves to `deviceModel: "Postman Client"`, `osVersion: "Postman"`.             |

> [!CAUTION]
> For mobile apps (`ios`, `android`), if the `User-Agent` app name does not match `APP_NAME`, the platform does not match `x-client-id`, or the app version is below `MIN_APP_VERSION`, `ClientIdentityGuard` rejects the request with HTTP `401 Unauthorized`.

---

## 🔑 2. User Session Authentication (JWT)

Endpoints that require an authenticated user session are decorated with `JwtAuthGuard` (e.g. `@UseGuards(JwtAuthGuard)`).

### Bearer Token Header

To access protected routes, client applications must provide the access token in the standard HTTP `Authorization` header:

```http
Authorization: Bearer <your_jwt_access_token>
```

---

### 🛡️ Dual-Token Architecture & Security Rationale

To balance low latency (stateless authentication) with high security (instant revocability), BreathAway enforces an RFC 6749 and RFC 6819 compliant dual-token architecture:

1. **Access Token (Short-Lived)**:
   - **Lifespan**: Configured via `JWT_EXPIRES_IN` (Default: `15m`).
   - **Storage**: In-memory (RAM / secure mobile keystore).
   - **Verification**: Verified via `JwtStrategy` through a dual-layer architecture: cryptographic signature validation coupled with a sub-millisecond in-memory Redis Set lookup (`user:active:<userId>`). Only un-cached or cold tokens fall back to PostgreSQL, reducing warm authorization latency to ~1.16 ms.
   - **Audience**: Verified against `JWT_AUDIENCE` (e.g. `breathaway-api`).

2. **Refresh Token (Long-Lived, Single-Use)**:
   - **Lifespan**: Configured via `JWT_REFRESH_EXPIRES_IN` (Default: `14d`).
   - **Storage**: Hardware-backed secure storage (iOS Keychain, Android EncryptedSharedPreferences).
   - **Endpoint**: Exclusively accepted at `POST /api/v1/auth/refresh`.
   - **Audience**: Strictly locked to `${JWT_AUDIENCE}:refresh` (e.g. `breathaway-api:refresh`).

> [!IMPORTANT]
> **Audience Separation Defense**: Access tokens and refresh tokens use mutually exclusive `aud` claims. If a client attempts to present a refresh token to an API route protected by `JwtAuthGuard`, or an access token to `/api/v1/auth/refresh`, the token is rejected at the cryptographic verification step before any database queries execute.

---

### 🧩 Token Claims & Cryptographic Lineage

Refresh tokens contain structured claims that link the token to an explicit session lineage:

```json
{
  "sub": "01KY9DY8M1GARMFEHXFJBZ08RM",
  "aud": "breathaway-api:refresh",
  "iss": "breathaway-auth",
  "jti": "UEdjtynJEB9APUfBlM5IguFsuM5ZWjgp",
  "familyId": "pulOGDHQMRxSKELeDqDp0zzK",
  "token_type": "refresh",
  "iat": 1728034255,
  "exp": 1729243855
}
```

- **`sub` (Subject)**: The authenticating user's ULID.
- **`jti` (JWT ID)**: A cryptographically random string (`nanoid(24)` for access tokens, `nanoid(32)` for refresh tokens).
- **`familyId`**: A 24-character lineage identifier (`nanoid(24)`). Generated upon initial authentication and embedded in **both Access Tokens and Refresh Tokens** to uniquely link every request to its originating session family across rotations.
- **`token_type`**: Set to `'refresh'` on refresh tokens. Access tokens omit this claim or default to standard bearer tokens.

---

### 🔒 Cryptographic Token Hashing (`tokenHash`)

To prevent offline database compromise from resulting in session takeover, **plaintext refresh tokens are never persisted in the database**:

1. When a refresh token is issued, `AuthTokenService` generates the signed JWT string.
2. The server calculates an unsalted SHA-256 digest of the complete token string:
   ```typescript
   const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
   ```
3. Only this 64-character hexadecimal digest is stored in `UserSession.tokenHash`.

**Threat Model Impact**: If an adversary gains unauthorized read access to database backups or read replicas via SQL injection, they cannot use the stored `tokenHash` values to authenticate or rotate tokens. Only the legitimate client holding the raw, signed JWT can present the credential.

---

### ⚔️ RFC 6819 §5.2.2.3: Refresh Token Rotation & Breach Containment

Refresh Token Rotation (RTR) guarantees that **every refresh token is strictly single-use**. Whenever a refresh token is exchanged, it is immediately invalidated and replaced with a newly issued token.

#### Threat Scenario & Automatic Breach Containment

If an attacker intercepts a user's refresh token (Token 1):

```mermaid
sequenceDiagram
    autonumber
    actor Victim as Legitimate Client
    actor Attacker as Malicious Actor
    participant Auth as AuthTokenService / PostgreSQL

    Note over Victim, Auth: 1. Normal Rotation
    Victim ->> Auth: POST /refresh with Token 1 (familyId: F1)
    Auth ->> Auth: Invalidate Token 1 (revokedAt = now())
    Auth -->> Victim: Issue Token 2 (familyId: F1)

    Note over Attacker, Auth: 2. Stolen Token Replay Attempt
    Attacker ->> Auth: POST /refresh with Token 1 (familyId: F1)
    Auth ->> Auth: Query UserSession by jti (Token 1)
    Note over Auth: 🚨 Replay Detected! Token 1 is already revoked!

    rect rgb(255, 235, 235)
        Note over Auth: Breach Containment Protocol Triggered
        Auth ->> Auth: UPDATE UserSession SET revokedAt = now() WHERE familyId = F1
    end

    Auth -->> Attacker: 401 Unauthorized (Breach detected; family terminated)

    Note over Victim, Auth: 3. Legitimate Client Locked Out for Safety
    Victim ->> Auth: POST /refresh with Token 2 (familyId: F1)
    Auth -->> Victim: 401 Unauthorized (Family was revoked due to breach)
    Note over Victim: App securely clears local keystore and prompts for fresh login
```

By invalidating the entire `familyId` lineage, the backend neutralizes the attacker's persistence and alerts the user to re-authenticate with their primary credentials.

---

### ⚡ Race Condition Defense: 10-Second Grace Window & Atomic CAS

In distributed client environments — such as serverless SSR proxy instances, multiple browser tabs, mobile cold starts, `bfcache` restores, and network retries — when a short-lived access token expires after 15 minutes, multiple asynchronous HTTP requests (e.g. fetching user profile, unread notification counts, and discovery cards) may fail with `401 Unauthorized` at the exact same millisecond.

If multiple parallel `/refresh` requests land on separate serverless instances carrying the same refresh token, strict zero-tolerance one-time-use RTR would falsely flag the second request as a replay attack and terminate the user's entire session lineage.

#### The 10-Second Grace Window & Upstash Redis Cache

To eliminate false-positive session terminations without sacrificing breach containment:

1. **Idempotent 10-Second Leeway (`ROTATION_GRACE_PERIOD_MS = 10_000`)**: When a refresh token rotates, the resulting `UserAuthResponseDto` is cached under `auth:refresh:grace:<consumed_jti>` in Upstash Redis (15-second TTL) and process-local memory.
2. **Grace Hit**: If any subsequent request presents that consumed token within 10 seconds, `AuthTokenService` returns the exact same cached token pair immediately. No new database writes are performed, and no token tree branches are created.
3. **Atomic CAS with Concurrency Resolution**: When two requests race at the exact same millisecond:

   ```typescript
   // Atomic CAS: Only update if revokedAt is STILL null at the instant of execution
   const updateResult = await tx.userSession.updateMany({
     where: { id: session.id, revokedAt: null },
     data: { revokedAt: DateUtil.now() },
   });

   if (updateResult.count === 0) {
     // A parallel request consumed this token milliseconds ago!
     // Poll Upstash Redis / memory for the winning request's cached response.
   }
   ```

   Instead of immediately killing the session family, the second request polls the cache (50ms interval, up to 5 attempts) to receive the winning request's response.

4. **Breach Containment (> 10s)**: Any reuse attempt occurring after the 10-second window is recognized as genuine token theft and triggers immediate RFC 6819 §5.2.2.3 family revocation across all devices.

While the backend is completely concurrency-safe via CAS, client applications (iOS and Android) must implement a **refresh mutex/queue lock** in their HTTP network interceptor:

1. When a 401 response is intercepted, acquire a local refresh lock.
2. Queue any subsequent 401 requests while the refresh call is in flight.
3. Perform a single `POST /api/v1/auth/refresh` call.
4. Update local storage with the new access and refresh token pair.
5. Replay all queued requests with the updated `Authorization: Bearer <new_token>` header, then release the lock.

---

### ⚡ Sub-Millisecond Active Session Validation & Redis Set Architecture

In a stateless deployment on Google Cloud Run with horizontal autoscaling, authenticating every incoming HTTP request by running a PostgreSQL query (`SELECT * FROM "User" WHERE id = $1 AND "deletedAt" IS NULL`) introduces two operational challenges:

1. **Cloud SQL Connection Pool Depletion**: With `DB_POOL_MAX = 4` per container instance, high-concurrency bursts spend valuable database connections on read-only authentication checks rather than core transactional queries (e.g. credit purchases or matching).
2. **Elevated Route Latency**: Roundtrip network queries to PostgreSQL via Cloud SQL Auth Proxy take ~11.5 ms per call.

BreathAway resolves this by coupling Passport's cryptographic JWT signature verification with a high-performance in-memory cache managed by `JwtAuthCacheService`.

#### The 4-Step `JwtStrategy` Verification Lifecycle

When a request decorated with `JwtAuthGuard` reaches the server, `JwtStrategy.validate(req, payload)` executes a strict 4-step verification sequence:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Authenticated Client
    participant Guard as JwtAuthGuard / JwtStrategy
    participant Cache as JwtAuthCacheService
    participant Redis as Redis Cache (user:active / auth:revoked)
    participant PostgreSQL as Cloud SQL PostgreSQL

    Client ->> Guard: HTTP Request + Bearer <token>
    activate Guard
    Note over Guard: Step 1: Cryptographic signature & audience verified
    Guard ->> Cache: isUserActive(payload.sub, payload.jti)
    activate Cache
    Cache ->> Redis: SISMEMBER user:active:<userId> <jti>
    activate Redis
    Redis -->> Cache: Set membership result (1 or 0)
    deactivate Redis
    Cache -->> Guard: Cache Hit / Miss
    deactivate Cache

    alt Step 2: Warm Cache Hit (isUserActive == true)
        Note over Guard: ✅ Sub-millisecond return (~1.16ms)<br/>Zero DB queries executed
        Guard -->> Client: 200 OK (Request proceeds to controller)
    else Cache Miss (isUserActive == false)
        Guard ->> Cache: isTokenRevoked(payload.jti)
        activate Cache
        Cache ->> Redis: EXISTS auth:revoked:<jti>
        activate Redis
        Redis -->> Cache: 1 (Revoked) or 0 (Not Revoked)
        deactivate Redis
        Cache -->> Guard: Revocation status
        deactivate Cache

        alt Step 3: Token Explicitly Revoked (Signed Out Device)
            Note over Guard: 🚨 Immediate Rejection: Zero DB queries executed
            Guard -->> Client: 401 Unauthorized ("Session has been revoked")
        else Step 4: Token Not Revoked (Cold Start / Cache Expiry)
            Guard ->> PostgreSQL: Query User record (findUnique)
            activate PostgreSQL
            PostgreSQL -->> Guard: User record or null
            deactivate PostgreSQL

            alt User Inactive or Soft-Deleted
                Guard -->> Client: 401 Unauthorized ("User inactive or deleted")
            else User Active & Healthy
                Guard ->> Cache: addToken(payload.sub, payload.jti)
                activate Cache
                Note over Cache, Redis: Atomic Pipeline: saddWithExpire (1 RTT)
                Cache ->> Redis: SADD user:active:<userId> <jti> + EXPIRE 300s
                activate Redis
                Redis -->> Cache: OK
                deactivate Redis
                Cache -->> Guard: Cache populated
                deactivate Cache
                Guard -->> Client: 200 OK (Request proceeds to controller)
            end
        end
    end
    deactivate Guard
```

#### Multi-Device Set Storage (`user:active:<userId>`)

Active tokens are stored in an in-memory **Redis Set**:

- **Key Pattern**: `user:active:<userId>`
- **Set Members**: Active access token `jti` strings (32-character nanoids).
- **Multi-Device Support**: When a user logs in from their mobile device and subsequently signs in on their desktop laptop, each access token's `jti` is added to the same Redis Set via `SADD`. Because sets hold unique members, multiple devices remain warm simultaneously without overwriting or evicting one another.
- **$O(1)$ Time Complexity**: Validating whether an access token belongs to an active user executes via `SISMEMBER user:active:<userId> <jti>` in $O(1)$ time, yielding an average execution latency of **1.16 ms**.

#### Atomic Pipelining (`saddWithExpire`)

Refreshing cache entries requires adding the member and extending the key TTL. Rather than issuing `SADD` and `EXPIRE` over two distinct network roundtrips, `RedisService.saddWithExpire` pipelines them into a single TCP packet:

```typescript
const pipeline = this.redisClient.pipeline();
pipeline.sadd(key, member);
pipeline.expire(key, ttlSeconds);
await pipeline.exec();
```

#### Targeted Single-Device Signout vs. Global Logout Mechanics

Session invalidation is differentiated between individual client devices and global emergency signouts:

1. **Targeted Single-Device Signout (`POST /api/v1/auth/signout` with `refreshToken`)**:
   - The route handler inspects the incoming access token via `@CurrentJti()`.
   - `JwtAuthCacheService.removeToken(userId, accessJti)` executes `SREM user:active:<userId> <accessJti>`.
   - `JwtAuthCacheService.revokeAccessToken(accessJti)` creates `auth:revoked:<accessJti> = 1` with a 15-minute TTL (`REVOKED_TOKEN_TTL_SECONDS = 900`).
   - The signed-out device is immediately blocked from the API even if its access token has remaining validity, while sessions on the user's other devices remain active and cached.
2. **Global Logout (`POST /api/v1/auth/signout` without `refreshToken`)**:
   - `JwtAuthCacheService.revokeUser(userId)` executes `DEL user:active:<userId>`, immediately invalidating all active sessions across every device.
3. **Account Deletion & Soft-Delete**:
   - The asynchronous `USER_DELETED_EVENT` listener in `AuthService` triggers `JwtAuthCacheService.revokeUser(userId)`, purging all cached sessions from Redis instantly.

#### Configuration Flags & Safe Fallback

| Configuration Key       | Type    | Default | Description                                                                                                      |
| :---------------------- | :------ | :-----: | :--------------------------------------------------------------------------------------------------------------- |
| `JWT_CACHE_ENABLED`     | Boolean | `true`  | Master kill-switch. When `false`, disables Redis checks and routes all verification directly to PostgreSQL.      |
| `JWT_CACHE_TTL_SECONDS` | Number  |  `300`  | TTL for active session sets (in seconds). Automatically defaults to 300 if set to a non-positive integer or NaN. |

#### Empirical Benchmark Comparison

Benchmarking 30 consecutive authenticated requests within a 3-minute testing window demonstrates substantial throughput and resource protection benefits:

| Benchmark Metric                 | Direct PostgreSQL (Cache Off) | Redis Active Set (Cache On) | Production Gain                |
| :------------------------------- | :---------------------------: | :-------------------------: | :----------------------------- |
| **Warm Auth Execution Time**     |            11.5 ms            |           1.16 ms           | **89.9% Latency Reduction**    |
| **PostgreSQL Queries Executed**  |          30 queries           |           1 query           | **96.7% Database Load Drop**   |
| **Pool Connections Checked Out** |         30 checkouts          |         1 checkout          | **Eliminates Pool Contention** |

---

### ⏱️ Brute-Force Defense: Multi-Tiered Rate Limiting (@nestjs/throttler)

While cryptographic verification and RFC 6819 Token Family tracking safeguard against replayed credentials, public authentication APIs are prime targets for automated attacks:

- **Refresh Token Endpoints (`/refresh`)**: Vulnerable to signature brute-forcing or denial-of-service (DoS) attempts aimed at exhausting database transaction pools with rapid token rotation requests.
- **Sign-In & Onboarding Endpoints (`/signin`, `/signup`, `/signin-or-signup`, `/add-phone`, `/add-email`)**: Vulnerable to credential stuffing, SMS/OTP pumping fraud, and high-frequency bot account creation.

BreathAway guards these critical attack surfaces using `@nestjs/throttler` with a tiered defense strategy.

#### Reverse Proxy & Google Cloud Run IP Resolution

In serverless Google Cloud Run deployments fronted by Google Cloud Load Balancing (GCLB), the default Express client IP resolution (`req.ip`) evaluates to an internal Google infrastructure IP. Under default settings, **every mobile client worldwide would share the exact same rate-limiting counter**, causing false-positive 429 lockouts.

To enforce per-client rate isolation:

1. **Express Trust Proxy**: Configured via `app.set('trust proxy', true)` in [`main.ts`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/main.ts).
2. **Deterministic IP Resolution (`extractClientIp`)**: Provided in [`request.utils.ts`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/common/utils/request.utils.ts) and wired into `ThrottlerModule.forRootAsync` via `getTracker`:
   ```typescript
   export function extractClientIp(req: Request): string | undefined {
     const forwarded = req.headers['x-forwarded-for'];
     if (typeof forwarded === 'string' && forwarded.length > 0) {
       return forwarded.split(',')[0].trim();
     }
     if (Array.isArray(forwarded) && forwarded.length > 0) {
       return forwarded[0].split(',')[0].trim();
     }
     return (
       (req.headers['x-real-ip'] as string) ||
       req.ip ||
       req.socket?.remoteAddress
     );
   }
   ```
   This guarantees that the client's genuine public IP address (the leftmost entry in `x-forwarded-for`) governs their individual rate limit bucket.

#### Multi-Tier Throttling Profiles

Rather than a single coarse window, BreathAway configures three concurrent time horizons (`short`, `medium`, `long`) to simultaneously defeat high-frequency bursts and sustained distributed brute-force campaigns:

| Policy Constant               | Target Endpoints                                                                                                                                                       | Short Tier (1s) | Medium Tier (10s) | Long Tier (60s) | Rationale & Protection                                                                                                                    |
| :---------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------: | :---------------: | :-------------: | :---------------------------------------------------------------------------------------------------------------------------------------- |
| **`AUTH_REFRESH_THROTTLE`**   | `POST /api/v1/auth/refresh`                                                                                                                                            |      2 req      |       5 req       |     10 req      | Permits an immediate burst of 2 requests in 1 second (handling parallel 401 retries from mobile apps), but strictly clamps at 10 req/min. |
| **`AUTH_STRICT_THROTTLE`**    | `POST /api/v1/auth/signup`<br/>`POST /api/v1/auth/signin`<br/>`POST /api/v1/auth/signin-or-signup`<br/>`POST /api/v1/auth/add-phone`<br/>`POST /api/v1/auth/add-email` |      1 req      |       3 req       |      5 req      | Stringent throttle preventing credential stuffing, OTP toll fraud, and automated account farming.                                         |
| **`AUTH_DEV_LOGIN_THROTTLE`** | `POST /api/v1/admin/dev-login`                                                                                                                                         |      2 req      |       5 req       |     10 req      | Protects local/staging developer bypass route from automation scripts.                                                                    |

#### Error Response Contract (`429 Too Many Requests`)

When a client breaches any of the configured throttler thresholds, the NestJS `ThrottlerGuard` immediately halts processing before controller or database execution, returning standard HTTP 429:

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

---

### 🧹 Session Retention & Storage Lifecycle

Because access tokens expire in 15 minutes, an active user generates approximately 4 `UserSession` records per active hour (~96 records/day). Over months across thousands of users, the table accumulates millions of rows, degrading B-tree index performance on `jti` and `userId`.

BreathAway executes an automated, chunked retention cleanup job:

- **Schedule**: Weekly (`0 3 * * 0 UTC`) via Cloud Scheduler invoking `POST /api/v1/internal/jobs/purge-expired-sessions`.
- **Grace Period**: Purges sessions where `expiresAt < NOW() - INTERVAL '7 days'`, retaining a 7-day audit horizon for forensics.
- **Batching**: Iteratively deletes in chunks of 5,000 rows to avoid PostgreSQL lock escalation and WAL buffer exhaustion.
- **Documentation**: See [Maintenance Module](/modules/maintenance#5-scheduled-user-session-retention-cleanup) for execution details.

---

### 📱 Active Sessions & Remote Session Management

To allow users to view, manage, and terminate their login sessions across web and mobile devices, BreathAway provides dedicated session endpoints managed by the **[Sessions Module](/modules/sessions)**:

| Endpoint               | Method   | Description                                                                                                        |
| :--------------------- | :------- | :----------------------------------------------------------------------------------------------------------------- |
| `/api/v1/sessions`     | `GET`    | Lists all active sessions with correlated hardware/push devices, User-Agent metadata, and current session markers. |
| `/api/v1/sessions/:id` | `DELETE` | Terminates a specific session by ULID or lineage `familyId`, deactivating push notifications on that device.       |
| `/api/v1/sessions`     | `DELETE` | Terminates all other active sessions for the user while preserving the caller's current session.                   |

#### Current User Parameter Decorators

Controllers handle authenticated request contexts using the parameter decorators defined in [`src/common/decorators/current-user.decorator.ts`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/common/decorators/current-user.decorator.ts):

```typescript
import {
  CurrentFamilyId,
  CurrentJti,
  CurrentUserId,
} from '@common/decorators';

@Delete('sessions')
@UseGuards(JwtAuthGuard)
async revokeOtherSessions(
  @CurrentUserId() userId: string,
  @CurrentFamilyId() currentFamilyId?: string,
  @CurrentDeviceId() currentDeviceId?: string,
) {
  return this.sessionsService.revokeAllOtherSessions(userId, currentFamilyId, currentDeviceId);
}
```

- **`@CurrentUserId()`**: Extracts `request.user.userId`. Throws `InternalServerErrorException` if the route is missing a guard.
- **`@CurrentFamilyId()`**: Extracts `request.user.familyId` (the active session family lineage).
- **`@CurrentJti()`**: Extracts `request.user.jti` (the specific access token ID).

---

## ☁️ 3. Internal GCP Service Authentication (OIDC)

Internal endpoints that are triggered exclusively by Google Cloud services—specifically **Cloud Scheduler cron jobs** (`/api/v1/internal/jobs/*`) and **Cloud Pub/Sub push subscriptions** (`/api/v1/pubsub/ingest`)—are secured by [`GcpOidcAuthGuard`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/common/guards/gcp-oidc-auth.guard.ts).

These routes apply `@SkipClientIdentity()` (since requests originate from Google infrastructure rather than mobile devices) and `@UseGuards(GcpOidcAuthGuard)`.

### How GCP OIDC Works

1. Google Cloud infrastructure (Pub/Sub or Scheduler) acts on behalf of an IAM Service Account (`pubsub-invoker` or `scheduler-invoker`).
2. Google generates a short-lived (~1 hour), cryptographically signed OpenID Connect ID token (JWT) where `aud` equals the Cloud Run service URL.
3. The token is delivered in the `Authorization: Bearer <JWT>` header.

### 🛡️ Defense Against "Confused Deputy" Attacks

In Google Cloud, any GCP user can request an OIDC ID token targeting any public URL as the audience claim (`aud`). To prevent an external attacker in another GCP project from invoking our endpoints with a token signed for our URL, `GcpOidcAuthGuard` performs strict 5-point validation:

```mermaid
flowchart TD
    Req["Inbound Request (Authorization: Bearer <JWT>)"] --> Step1{"1. Google Public JWKS<br/>Signature & Expiry Valid?"}
    Step1 -- "Invalid" --> Reject["401 Unauthorized"]
    Step1 -- "Valid" --> Step2{"2. iss == accounts.google.com?"}
    Step2 -- "No" --> Reject
    Step2 -- "Yes" --> Step3{"3. aud == GCP_OIDC_AUDIENCE?"}
    Step3 -- "No" --> Reject
    Step3 -- "Yes" --> Step4{"4. email_verified == true?"}
    Step4 -- "No" --> Reject
    Step4 -- "Yes" --> Step5{"5. Confused Deputy Defense:<br/>email ends with @GCP_PROJECT_ID.iam.gserviceaccount.com?"}
    Step5 -- "No" --> Reject
    Step5 -- "Yes" --> Allow["Approve Request<br/>Attach oidcPayload"]
```

1. **Cryptographic Signature**: Verified dynamically against Google's public JWKS certificates (`https://www.googleapis.com/oauth2/v3/certs`).
2. **Issuer Claim (`iss`)**: Must strictly match `https://accounts.google.com` or `accounts.google.com`.
3. **Audience Claim (`aud`)**: Must strictly match `GCP_OIDC_AUDIENCE` to prevent cross-service token reuse.
4. **Verified Email**: Ensures `email_verified: true` and `email` is present.
5. **Caller Origin**: Ensures `email` ends with `@${GCP_PROJECT_ID}.iam.gserviceaccount.com`, immediately blocking tokens created in foreign GCP projects.

---

## 🔄 Authentication Sequence Flow (Client & User)

```mermaid
sequenceDiagram
    autonumber
    actor MobileClient as Mobile App Client
    participant CGuard as ClientIdentityGuard
    participant JWTGuard as JwtAuthGuard
    participant Controller as NestJS Controller

    MobileClient ->> CGuard: HTTP Request (Headers + Body)
    activate CGuard
    Note over CGuard: Validates x-api-key, x-client-id, and x-user-agent
    alt Validation Fails
        CGuard -->> MobileClient: 401 Unauthorized / 400 Bad Request
    else Validation Succeeds
        CGuard ->> JWTGuard: Request approved (passes identity meta)
    end
    deactivate CGuard

    activate JWTGuard
    Note over JWTGuard: Extracts JWT from Authorization Header
    alt Token Missing or Expired
        JWTGuard -->> MobileClient: 401 Unauthorized
    else Token Valid
        JWTGuard ->> Controller: Request approved (attaches req.user)
    end
    deactivate JWTGuard

    activate Controller
    Controller ->> MobileClient: 200 OK (Response Payload)
    deactivate Controller
```

---

## 🛠️ 4. Administrative & Developer Authentication (Google OIDC + GCP IAM)

Administrative APIs (`/api/v1/admin/*` including developer bypass `/api/v1/admin/dev-login`, `/api/v1/notifications/*`, `/api/v1/reports/*`, `/api/v1/payments/routes/*`, `/api/v1/social-identities/*`, `/api/v1/transactions/*`, `/api/v1/instagram/*`) are secured by [`AdminOidcAuthGuard`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/admin/guards/admin-oidc-auth.guard.ts).

This replaces legacy HTTP Basic Auth and shared static passwords with **Zero-Trust Google OpenID Connect (OIDC)**, delegating identity verification to Google and authorization to Google Cloud IAM.

---

### ⚖️ Regular Customer Flow vs. Admin OIDC Flow

| Architectural Aspect          | Regular Customer Flow (App Users)                         | Administrative OIDC Flow (Engineers / Admins)                        |
| :---------------------------- | :-------------------------------------------------------- | :------------------------------------------------------------------- |
| **Primary Identity Provider** | Firebase Auth (Phone OTP, Apple, Google Sign-In)          | Google Accounts (`@gmail.com` or `@mycompany.com`)                   |
| **Token Type & Issuer**       | BreathAway Custom JWTs (HMAC/RSA issued by Backend)       | Google OIDC ID Token issued by `accounts.google.com`                 |
| **Token Lifetime**            | 15 minutes (Access) / 14 days (Refresh Token Family)      | 1 hour (Google standard OIDC lifetime, no refresh flow)              |
| **Client Headers Required**   | `x-api-key`, `x-client-id`, `x-user-agent`, `x-device-id` | `@SkipClientIdentity()` applied (No client app headers required)     |
| **Authorization Source**      | PostgreSQL database tables (`User`, `UserRole`, status)   | Live GCP Project IAM Policy (`roles/owner`, `roles/editor`)          |
| **Revocation Mechanism**      | Database session deletion / token blacklist               | Removing developer from GCP Project IAM in Google Cloud Console      |
| **Audit Logging Actor**       | Internal User ULID (`sub: "01KY9DY8M1GARM..."`)           | Verified Google email (`adminEmail: "engineer@company.com"`)         |
| **Audit Sink Destination**    | Application database & standard access logs               | GCP Cloud Logging & BigQuery Sink (`jsonPayload.adminEmail`)         |
| **Interactive Tooling**       | Mobile App / Public Web Client                            | Terminal (`curl`), Postman, and Admin Swagger UI (`/api/docs/admin`) |

---

### 🛡️ How Admin OIDC Verification Works

When a request reaches a route protected by `AdminOidcAuthGuard`:

1. **Header Validation**: Extracts the Bearer token from `Authorization: Bearer <token>`. Rejects missing or malformed headers with `401 Unauthorized`.
2. **Cryptographic Google JWKS Verification**:
   - The token signature is verified against Google's public JWKS certificates (`https://www.googleapis.com/oauth2/v3/certs`) via `google-auth-library`.
   - Google certificates are automatically cached in-memory, requiring 0ms network latency on subsequent requests.
   - Verifies `iss` is `accounts.google.com` or `https://accounts.google.com`.
   - Verifies `aud` matches either configured audiences (`GCP_ADMIN_OIDC_AUDIENCE` / `GCP_OIDC_AUDIENCE`) or Google Cloud SDK's canonical client ID (`32555940559.apps.googleusercontent.com`).
   - Verifies `email_verified: true` and extracts `payload.email`.
3. **Dynamic GCP IAM Authorization**:
   - **Step 3A (Cached IAM Policy)**: Checks in-memory cache of authorized project emails. If cached and TTL (5 minutes) has not expired, authorizes immediately.
   - **Step 3B (GCP Cloud Resource Manager Query)**: Calls the GCP Resource Manager API (`POST https://cloudresourcemanager.googleapis.com/v1/projects/{projectId}:getIamPolicy`) using Application Default Credentials (ADC) locally or the Cloud Run service account in cloud environments.
   - Extracts all members bound to `roles/owner`, `roles/editor`, `roles/resourcemanager.organizationAdmin`, or roles specified in `GCP_ADMIN_IAM_ROLES`.
   - If `user:<email>` is found in the IAM policy bindings, updates the in-memory cache and grants access.
   - If not found, logs a warning and throws `403 Forbidden: Caller does not have administrative permissions in GCP`.
4. **Context Propagation & Structured Audit Logging**:
   - Injects `adminEmail`, `adminSub`, and `adminEmailHash` (SHA-256) into Continuation-Local Storage (CLS) via `ClsService`.
   - Attaches `request.adminUser = { email, sub, emailHash }`.
   - Emits structured JSON log with `step: 'authenticate'`, `adminEmail`, and request details.
   - Any downstream call to `BaseService.emitAuditLog` automatically enriches audit events (`PubSubEvent.SYSTEM_AUDIT_LOG`) with the admin email for BigQuery ingestion.

---

### 🔄 Admin Authentication Sequence Flow

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Engineer / Admin<br/>(@gmail.com or @company.com)
    participant CLI as Terminal / Postman / Swagger
    participant Backend as NestJS Admin Endpoint
    participant Guard as AdminOidcAuthGuard
    participant GoogleJWKS as Google OAuth JWKS
    participant GCPIAM as GCP Cloud Resource Manager API
    participant Logger as Cloud Logging / BigQuery

    Admin->>CLI: gcloud auth login
    Admin->>CLI: export TOKEN=$(gcloud auth print-identity-token)
    CLI->>Backend: HTTP POST /v1/notifications/send (Authorization: Bearer <TOKEN>)
    Backend->>Guard: canActivate(context)

    Guard->>GoogleJWKS: 1. Cryptographically verify signature & claims (Local/Cached)
    alt Invalid Signature / Expired / Unverified Email
        Guard-->>CLI: 401 Unauthorized
    end

    alt Cache Valid (<5m TTL)
        Guard->>Guard: Authorize from Cache
    else Cache Expired / Miss
        Guard->>GCPIAM: 2. POST /v1/projects/{projectId}:getIamPolicy
        GCPIAM-->>Guard: Return project IAM bindings (roles/owner, roles/editor)
        Guard->>Guard: Populate in-memory cache (5m TTL)
    end

    alt Caller Not in Project IAM Policy
        Guard-->>CLI: 403 Forbidden (Caller lacks admin permissions)
    else Caller Authorized
        Guard->>Backend: 3. Set CLS context (adminEmail, adminSub)
        Guard->>Logger: 4. Structured log (adminEmail, route, method)
        Backend->>Backend: Execute administrative business logic
        Backend->>Logger: 5. Emit domain audit event enriched with adminEmail
        Backend-->>CLI: 200 OK / 204 No Content
    end
```

---

### 💻 Developer Guide: How to Generate and Use Admin Tokens

#### 1. Prerequisites

- The engineer's Google account (`user@gmail.com` or `user@mycompany.com`) must be added to the GCP project (`breathaway-development` / `breathaway-prod`) with the **Editor** or **Owner** role.
- Google Cloud CLI (`gcloud`) installed locally.

#### 2. Generating the Token

Run the following in your terminal:

```bash
# 1. Log in with your authorized Google account
gcloud auth login

# 2. Mint the short-lived 1-hour Google OIDC identity token
export TOKEN=$(gcloud auth print-identity-token)
```

> [!NOTE]
> **Why no `--audiences` flag?**: The `--audiences` flag in `gcloud auth print-identity-token` is only permitted for Service Accounts. For human developer accounts, omitting `--audiences` produces a token targeted at the Google Cloud SDK client ID (`32555940559.apps.googleusercontent.com`), which `AdminOidcAuthGuard` natively accepts.

#### 3. Using in Swagger UI

1. Open the Admin Swagger documentation: `http://localhost:3000/api/docs/admin` (or production URL).
2. Click the green **Authorize** button at the top right.
3. Paste the token into the **`gcp-oidc (http, Bearer)`** input field and click **Authorize**.
4. All admin endpoints can now be executed interactively.

#### 4. Using in Postman / Curl

```bash
curl -X POST "http://localhost:3000/api/v1/notifications/send" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "EMAIL",
    "category": "TRANSACTIONAL",
    "type": "USER_WELCOME",
    "recipientUserId": "01KY9DY8M1GARMFEHXFJBZ08RM"
  }'
```

---

### ☁️ Required Google Cloud Platform Services & Permissions

To enable dynamic IAM evaluation, the GCP project and runtime environment require the following configuration:

#### 1. Enable Cloud Resource Manager API

The GCP Cloud Resource Manager API must be enabled on the project to allow the backend to query project IAM policies:

```bash
gcloud services enable cloudresourcemanager.googleapis.com --project=breathaway-development
```

#### 2. Service Account Permissions (Cloud Run)

The Cloud Run runtime service account (`backend-service@<project-id>.iam.gserviceaccount.com`) must be granted read access to the project IAM policy:

```bash
gcloud projects add-iam-policy-binding <project-id> \
  --member="serviceAccount:backend-service@<project-id>.iam.gserviceaccount.com" \
  --role="roles/browser"
```

_(Alternatively, grant `roles/viewer`)._

#### 3. Local Development (Localhost)

When running the NestJS backend locally on localhost:

- Run `gcloud auth application-default login` so your local Node.js process inherits credentials to query Cloud Resource Manager.
