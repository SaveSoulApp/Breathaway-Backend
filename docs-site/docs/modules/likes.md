---
sidebar_position: 3
---

# Likes Module

The `LikesModule` manages liking mechanics, capturing user intents, and executing state transitions for outbound connection requests.

---

## 📋 Purpose & Responsibilities

- **Liking Mechanics**: Persists connection intents from one user to another's identity.
- **Pre-Flight Validation**: Provides `POST /likes/can-create` to evaluate match/like eligibility instantly without executing DB transactions or consuming credits.
- **Relational Intent Capturing**: Tracks the specific dating/connection intents of the sender to ensure mutual compatibility checks.
- **Credit Deductions Integration**: Integrates with the `CreditsModule` to deduct credit balances for specific actions (such as sending a super-like).
- **Idempotent Re-Liking & Soft-Delete Resurrection**: Seamlessly handles re-liking previously deleted, withdrawn, or voided likes by updating the existing record back to `PENDING` rather than inserting a duplicate row or throwing a unique constraint conflict.

---

## 🔄 End-to-End Like Creation Workflow

The following sequence diagram illustrates the end-to-end execution path when a client issues a `POST /api/v1/likes` request, as implemented across `LikesController` and `LikesService`.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Mobile Client
    participant Controller as LikesController
    participant Service as LikesService
    participant Credits as CreditsService
    participant Identities as IdentitiesService
    participant Crypto as IdentityCryptoService
    participant DB as PrismaService / Cloud SQL
    participant Resolver as MatchResolverService
    participant Audit as AuditModule

    Client->>Controller: POST /api/v1/likes (DTO, x-timezone)
    Note over Controller: JwtAuthGuard validates token (userId)<br/>RequireTimezoneGuard extracts req.timezone
    Controller->>Service: create(userId, dto, timezone)

    rect rgb(240, 248, 255)
    Note over Service, Credits: Phase 1: Pre-Flight Credit Verification
    Service->>Credits: hasSufficientCredits(userId, CREDITS_PER_LIKE)
    Credits-->>Service: boolean
    alt Insufficient Credits
        Service->>Audit: emitAuditLog(USAGE_DENIED)
        Service-->>Controller: throw InsufficientCreditsException (400)
        Controller-->>Client: 400 Bad Request (Insufficient credits)
    end
    end

    rect rgb(255, 250, 240)
    Note over Service, Crypto: Phase 2: Target Identity Resolution
    alt Raw targetIdentity provided (without targetIdentityId)
        opt Phone Number without Country Code
            Service->>Identities: getSenderCountryCode(userId)
            Identities-->>Service: senderCountryCode
            Service->>Service: Prepend country code to E.164 format
        end
        Service->>Crypto: processPublicValue(resolvedValue, type)
        Crypto-->>Service: { publicValueHash, encryptedPublicValue }
        Service->>DB: identity.findUnique({ type, publicValueHash })
        alt Identity Found
            DB-->>Service: existing targetIdentityId
        else Identity Not Found (Ghost Identity)
            Service->>DB: identity.create(userId: null, isVerified: false, ...)
            DB-->>Service: new unresolved targetIdentityId
        end
    end
    end

    rect rgb(245, 255, 250)
    Note over Service, DB: Phase 3: Identity & Self-Like Validation
    Service->>DB: identity.findUnique({ id: targetIdentityId })
    alt Target Identity Does Not Exist
        Service-->>Controller: throw IdentityNotFoundException (404)
    else Target Belongs to Sender (targetIdentity.userId === userId)
        Service-->>Controller: throw SelfLikeException (400)
    end
    end

    rect rgb(255, 245, 245)
    Note over Service, DB: Phase 4: Duplicate & Active Match Pre-Flight Guards
    Service->>DB: like.findFirst(senderUserId, targetIdentityId, status: PENDING)
    opt Active PENDING Like Already Exists
        Service-->>Controller: throw AlreadyLikedException (409)
    end
    Service->>DB: like.findFirst(status IN [WITHDRAWN, VOIDED, DELETED] OR deletedAt != null)
    Note over Service: Identifies reusable row to resurrect instead of creating duplicate
    opt Target Identity has an Associated Registered User
        Service->>DB: match.findUnique(userOneId, userTwoId, status: ACTIVE)
        opt Active Match Already Exists
            Service-->>Controller: throw AlreadyMatchedException (409)
        end
    end
    end

    rect rgb(240, 255, 240)
    Note over Service, DB: Phase 5: Atomic Persistence & Credit Deduction ($transaction)
    Service->>DB: $transaction(async tx => ...)
    alt Reusable Like Row Exists (Resurrection)
        Service->>DB: tx.like.update(status: PENDING, deletedAt: null, expiresAt, intent, label)
    else Fresh Like
        Service->>DB: tx.like.create(senderUserId, targetIdentityId, status: PENDING, expiresAt, ...)
    end
    Service->>Credits: consumeCredits({ userId, amount: CREDITS_PER_LIKE, referenceId: like.id }, tx)
    Credits->>DB: tx.creditLedgerEntry.create(...) + tx.creditAccount.update(...)
    DB-->>Service: Transaction Committed (Persisted Like)
    end

    rect rgb(255, 240, 255)
    Note over Service, Resolver: Phase 6: Non-Blocking Asynchronous Match Resolution
    Service->>Resolver: resolveFromLike(like) [Async / Non-blocking]
    Note over Resolver, DB: Checks target user for mutual reverse like, intent compatibility, and active blocks.<br/>If mutual, creates Match atomically and dispatches push notifications.
    end

    rect rgb(245, 245, 255)
    Note over Service, Client: Phase 7: Audit Logging & Decrypted Response Hydration
    Service->>Audit: emitAuditLog(LIKE_CREATED)
    Service->>Identities: getDecryptedPublicValue(targetIdentityId)
    Identities-->>Service: decrypted publicValue
    Service-->>Controller: Hydrated Like with targetIdentity publicValue
    Controller-->>Client: 201 Created (LikeResponseDto)
    end
```

### Key Execution Phases Explained

1. **Guard Execution**: `JwtAuthGuard` validates the caller's JWT token and extracts the authenticated `userId`. `RequireTimezoneGuard` extracts and validates the client's `x-timezone` header, attaching it to `req.timezone` to compute accurate midnight expiration dates.
2. **Phase 1 (Credit Pre-Check)**: Before performing database queries or mutations, `CreditsService.hasSufficientCredits` ensures the user possesses at least `CREDITS_PER_LIKE` credits. If insufficient, an audit log (`USAGE_DENIED`) is recorded and `InsufficientCreditsException` is thrown.
3. **Phase 2 (Target Identity Resolution)**: If the client passed raw identity details (`targetIdentity`) rather than a known UUID, phone numbers are normalized to E.164 (using the caller's verified country code if omitted). SHA-256 hashing and AES-256 envelope encryption are performed by `IdentityCryptoService`. If no matching row exists, an unresolved "Ghost Identity" (`userId = null`) is created so intent can be registered even before the target registers.
4. **Phase 3 (Identity & Self-Like Validation)**: Verifies the target identity exists and ensures `targetIdentity.userId !== userId` (self-liking is rejected with `SelfLikeException`).
5. **Phase 4 (Duplicate & Active Match Pre-Flight Guards)**:
   - Rejects existing active `PENDING` likes with `AlreadyLikedException`.
   - Checks for reusable soft-deleted, withdrawn, or voided rows to prepare for resurrection.
   - Verifies whether an `ACTIVE` match already exists between the two users, aborting with `AlreadyMatchedException` before any credits are deducted.
6. **Phase 5 (Atomic Transaction)**: Inside a Prisma `$transaction`:
   - Either updates an existing inactive row back to `PENDING` (preserving row ID and audit trail) or inserts a new row.
   - Atomically deducts credits via `CreditsService.consumeCredits`, appending an immutable ledger entry.
7. **Phase 6 (Asynchronous Match Resolution)**: Calls `MatchResolverService.resolveFromLike` without blocking the HTTP response. If the counterpart previously liked this user with compatible intent, a mutual match is instantiated.
8. **Phase 7 (Response Hydration & Audit)**: Emits `LIKE_CREATED` audit event, decrypts the target identity's `publicValue` via `IdentitiesService`, and returns `LikeResponseDto` with HTTP 201.

---

## 🧠 Business Logic & Core Concepts

### 1. Atomic Credit Consumption

Sending a like is a premium action. The `LikesService` performs a pre-check for sufficient credits. When persisting the like, it uses a database transaction (`$transaction`) to atomically create the `Like` record and deduct the required credits via the `CreditsService`. If the user lacks credits, the system emits a `USAGE_DENIED` audit event.

### 2. "Ghost" Identity Target Resolution

In BreathAway, users do not just like other _users_; they like _target identities_ (e.g., an Instagram handle or a phone number).

- If the target identity is already registered to a user, the like targets them directly.
- If the target identity **does not exist**, the system creates an _unresolved_ "Ghost Identity" (`userId = null`). This allows users to express intent toward someone who hasn't joined the platform yet. When that person eventually registers, the Auth module claims this ghost identity and triggers retroactive matching.

### 3. Identity and Active Match Duplicate Prevention

When a user likes a target identity that resolves to an existing user profile (e.g., liking a user's phone number after already matching via their Instagram handle), the system verifies whether an `ACTIVE` match already exists between the two users.

- If an active match is found, the system explicitly aborts the transaction by throwing an `AlreadyMatchedException`.
- This early termination occurs **before** the credit consumption transaction begins, preventing unwarranted credit deductions and keeping the DB clean from duplicate likes tied to alternative identities.

**Pre-Flight API**: Clients can utilize the `POST /likes/can-create` endpoint with a target identity to verify eligibility beforehand. This avoids surprising the user with a failed transaction and enables smoother UI flows (like disabling the "Like" button in advance).

### 4. Re-Liking & Soft-Deleted Like Resurrection (Upsert Semantics)

The database schema enforces a unique constraint `@@unique([senderUserId, targetIdentityId])`, ensuring that only one like record can ever exist for a given sender-and-target-identity pair.

When a user deletes a pending like (`DELETE /api/v1/likes/:id`), the record is soft-deleted for auditability:

- Status transitions to `DELETED`.
- `deletedAt` is stamped with the current timestamp.

If the user subsequently attempts to like the same identity again:

- **No 409 Conflict**: Instead of attempting to insert a new row and failing with a database unique constraint violation (`409 Conflict: A record with this value already exists.`), the system identifies the existing inactive record (`DELETED`, `WITHDRAWN`, or `VOIDED`).
- **Resurrection back to `PENDING`**: Within the atomic `$transaction`, the service updates the existing record:
  - Resets `status` to `PENDING`.
  - Clears `deletedAt` back to `null`.
  - Refreshes `expiresAt` based on the current time and caller timezone.
  - Updates `intent` and optional personal `label`.
- **Full Operational Parity**: The resurrected like executes all standard liking operations:
  1. Verifies and deducts user credits atomically via `CreditsService.consumeCredits`.
  2. Emits a `LIKE_CREATED` audit log.
  3. Dispatches asynchronous mutual match resolution via `MatchResolverService.resolveFromLike`.
- **Pre-Flight Validation**: The `POST /api/v1/likes/can-create` endpoint recognizes soft-deleted records as re-likable, returning `{ canCreate: true }` as long as no active match exists and the user is not liking themselves.

### 5. Asynchronous Match Resolution

After a like is successfully persisted, the `LikesService` asynchronously delegates to the `MatchResolverService`. This design ensures that the critical path (deducting credits and saving the intent) is fast and isolated from the heavy logic of evaluating mutual connections. Failures in the resolver do not roll back the like creation.

### 6. Persistent Annotations (Labels)

Users can attach a personal string `label` to a like (e.g., "Sarah from the gym"). Business logic dictates that these labels can be updated at any time, even if the like transitions to a `MATCHED` or `VOIDED` state, allowing users to continually personalize their history.

---

## ⚙️ Managed Enums & States

The liking flow relies on two core enums:

### 1. IntentType

Defines the connection interest type selected by the sender:

- **`RELATIONSHIP`**: User is looking for long-term relationships.
- **`CASUAL`**: User is looking for casual dating or hangouts.
- **`OPEN`**: User is open to multiple connection models.

### 2. LikeStatus

Represents the state lifecycle of a liking record:

```mermaid
stateDiagram-v2
    [*] --> PENDING : User creates Like
    PENDING --> MATCHED : Target user sends a mutual Like
    PENDING --> VOIDED : Like expires without response
    PENDING --> DELETED : User soft-deletes like
    MATCHED --> WITHDRAWN : User dissolves previous match
    MATCHED --> VOIDED : Other party dissolves previous match
    DELETED --> PENDING : User re-likes same identity (resurrection)
    WITHDRAWN --> PENDING : User re-likes after unmatch (upsert)
    VOIDED --> PENDING : User re-likes after unmatch (upsert)
```

- **`PENDING`**: The like has been sent, and the target user has not yet liked back.
- **`MATCHED`**: A mutual like has been detected and resolved into an active Match.
- **`VOIDED`**: The like expired without a response, or was system-voided when the other party dissolved a previous match. Can transition back to `PENDING` on re-like.
- **`WITHDRAWN`**: The like was withdrawn when the user dissolved a previous match. Can transition back to `PENDING` on re-like.
- **`DELETED`**: The sender explicitly soft-deleted the pending like. If the user likes the same identity again, this row is resurrected back to `PENDING` rather than creating a duplicate or throwing a conflict.
