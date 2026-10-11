---
sidebar_position: 4
---

# Matches Module

The `MatchesModule` stores and tracks established, mutual connections between users, managing their state transitions and communication access rules.

---

## 📋 Purpose & Responsibilities

- **Match Tracking**: Persists mutual matches, recording the matching timestamp and both partners' initial intents.
- **Connection Lifecycle Management**: Updates match state parameters when users unmatch or block each other.
- **Access Authorization**: Acts as the gatekeeper for other communication systems (like Chats) to ensure a match is in an active state.

---

## 🔄 Core Workflows & Sequence Diagrams

The matching subsystem is orchestrated across two primary services:

1. **`MatchResolverService` (`src/modules/match-resolver`)**: The asynchronous engine triggered after a like is persisted, responsible for evaluating reciprocity, compatibility, and forging the `Match` record.
2. **`MatchesService` (`src/modules/matches`)**: Manages the lifecycle of active matches, queries, perspective normalisation, and connection dissolution (`unmatch`).

### 1. Match Resolution Pipeline (`MatchResolverService.resolveFromLike`)

This sequence executes asynchronously after a like is created in `LikesService.create()`. It runs outside the client's HTTP response path to keep swipe latency under 80ms.

```mermaid
sequenceDiagram
    autonumber
    participant Likes as LikesService
    participant Resolver as MatchResolverService
    participant Matches as MatchesService
    participant Blocks as BlocksService
    participant DB as PrismaService / Cloud SQL
    participant Events as EventEmitter2
    participant Listener as NotificationEventsListener
    participant Notifications as NotificationsService
    participant Audit as AuditModule

    Likes->>Resolver: resolveFromLike(newLike) [Unawaited Async Task]
    Note over Resolver: Step 1: Verify target identity is registered
    alt targetIdentity.userId is null (Ghost Identity)
        Resolver-->>Likes: Skip resolution (unresolved target)
    end

    Note over Resolver, DB: Step 2: Lookup Reciprocal Like
    Resolver->>DB: like.findFirst(sender: targetUserId, target: senderUserId,<br/>status IN [PENDING, VOIDED], expiresAt > now, deletedAt: null)
    alt No reverse like found
        Resolver-->>Likes: End pipeline (no mutual interest yet)
    end
    DB-->>Resolver: reverseLike record

    Note over Resolver: Step 3: Canonical Participant Sorting<br/>[userOneId, userTwoId] = [senderUserId, targetUserId].sort()
    Note over Resolver: Canonical likeOne belongs to userOneId, likeTwo belongs to userTwoId

    rect rgb(240, 248, 255)
    Note over Resolver, Blocks: Step 4: Validate Match Eligibility
    Resolver->>Matches: isIntentCompatible(newLike.intent, reverseLike.intent)
    alt Intents Incompatible (e.g., CASUAL vs RELATIONSHIP)
        Matches-->>Resolver: false
        Resolver-->>Likes: Suppress match creation (intent mismatch)
    end
    Matches-->>Resolver: true

    Resolver->>Blocks: isBlocked(senderUserId, targetUserId)
    alt Either user has blocked the other
        Blocks-->>Resolver: true
        Resolver-->>Likes: Suppress match creation (blocked user)
    end
    Blocks-->>Resolver: false

    Resolver->>DB: match.findUnique({ userOneId_userTwoId })
    opt Active Match Already Exists
        Resolver-->>Likes: End pipeline (prevent duplicate active match)
    end
    end

    rect rgb(240, 255, 240)
    Note over Resolver, DB: Step 5: Atomic Match Creation / Reactivation ($transaction)
    Resolver->>DB: $transaction(async tx => ...)
    alt Prior UNMATCHED record exists (Reactivation)
        Resolver->>DB: tx.match.update(id: existingMatch.id, status: ACTIVE,<br/>matchedAt: now, deletedAt: null, likeOneId, likeTwoId, intentOne, intentTwo)
    else New Match
        Resolver->>DB: tx.match.create(userOneId, userTwoId, status: ACTIVE,<br/>likeOneId, likeTwoId, intentOne, intentTwo)
    end
    Resolver->>DB: tx.like.update(id: likeOne.id, status: MATCHED)
    Resolver->>DB: tx.like.update(id: likeTwo.id, status: MATCHED)
    DB-->>Resolver: Transaction Committed (Match Persisted)
    end

    rect rgb(255, 245, 255)
    Note over Resolver, Events: Step 6: Audit Logging & Decoupled Domain Event
    Resolver->>Audit: emitAuditLog(MATCH_RESOLVED, userId, matchId, targetUserId)
    Resolver->>Events: emit(MATCH_CREATED_EVENT, new MatchCreatedEvent(matchId, userOneId, userTwoId))
    Note over Events, Listener: Asynchronous Listener Execution (@OnEvent)
    Events->>Listener: handleMatchCreated(event)
    Listener->>DB: userProfile.findMany({ userOneId, userTwoId })
    DB-->>Listener: profiles (firstNames)
    Listener->>Notifications: dispatch(userOneId, type: NEW_MATCH, channels: [PUSH, EMAIL])
    Listener->>Notifications: dispatch(userTwoId, type: NEW_MATCH, channels: [PUSH, EMAIL])
    end
```

---

### 2. Unmatch & Connection Dissolution (`MatchesService.unmatch`)

When an authenticated user dissolves a match (`DELETE /api/v1/matches/:id`), the operation executes as an asymmetric atomic transaction:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Mobile Client
    participant Controller as MatchesController
    participant Service as MatchesService
    participant DB as PrismaService / Cloud SQL
    participant Audit as AuditModule

    Client->>Controller: DELETE /api/v1/matches/:id (Bearer JWT)
    Note over Controller: JwtAuthGuard validates token and extracts userId
    Controller->>Service: unmatch(matchId, userId)

    Note over Service, DB: Step 1: Verification & Participation Gating
    Service->>DB: match.findFirst({ id: matchId, status: ACTIVE, deletedAt: null,<br/>OR: [{ userOneId: userId }, { userTwoId: userId }] })
    alt Match not found or caller is not a participant
        DB-->>Service: null
        Service-->>Controller: throw MatchNotFoundException (404)
        Controller-->>Client: 404 Not Found
    end
    DB-->>Service: match record (with likeOneId, likeTwoId, userOneId, userTwoId)

    Note over Service: Step 2: Determine Role Asymmetry<br/>initiatorLikeId: Like belonging to caller<br/>otherLikeId: Like belonging to counterpart

    rect rgb(255, 245, 245)
    Note over Service, DB: Step 3: Atomic Soft-Delete & Asymmetric Like Transition ($transaction)
    Service->>DB: $transaction([ ... ])
    Service->>DB: 1. match.update(id: matchId, status: UNMATCHED, deletedAt: now)
    Service->>DB: 2. like.update(id: initiatorLikeId, status: WITHDRAWN)
    Service->>DB: 3. like.update(id: otherLikeId, status: VOIDED)
    Note over DB: Initiator = WITHDRAWN (actively dissolved)<br/>Other party = VOIDED (system dissolved on their behalf)
    DB-->>Service: Transaction Committed
    end

    Note over Service, Audit: Step 4: Abuse & Safety Audit Trail
    Service->>Audit: emitAuditLog(MATCH_UNMATCHED, initiatorUserId, otherUserId, matchId)
    Service-->>Controller: { success: true }
    Controller-->>Client: 200 OK ({ success: true })
```

---

## 🧠 Business Logic & Core Concepts

### 1. Intent Compatibility Matrix

A match is only forged if both users' connection intents align. The `MatchesService` enforces this via a strict matrix:

- **`OPEN`**: Highly permissive; matches with any other intent (`OPEN`, `RELATIONSHIP`, `CASUAL`).
- **`RELATIONSHIP`**: Strict; matches only with `RELATIONSHIP` or `OPEN`.
- **`CASUAL`**: Strict; matches only with `CASUAL` or `OPEN`.

### 2. Perspective Normalisation

Internally, the database stores participants arbitrarily as `userOne` and `userTwo`. However, when returning data to the client, the `MatchesService` dynamically remaps the payload into `me` and `otherUser` based on the caller's ID. This guarantees that frontend clients always consume the API from the first-person perspective without needing to check which user slot they occupy.

### 3. Unmatching & Abuse Auditing

Dissolving a connection (Unmatching) acts as a soft-delete (stamping `deletedAt` and transitioning status to `UNMATCHED`). When this occurs, the service emits a `MATCH_UNMATCHED` audit event containing both user IDs. This allows backend moderators to detect abuse patterns, such as "rematch cycling" (matching, unmatching, and matching again rapidly).

---

## ⚙️ Managed Enums & States

The matching system manages records via the **`MatchStatus`** enum:

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : MatchResolver creates Match
    ACTIVE --> UNMATCHED : A user unmatches from profile
    ACTIVE --> BLOCKED : A user blocks the other profile
```

### Match States Reference

- **`ACTIVE`**:
  - **Description**: The connection is live and mutual.
  - **Permissions**: Both users can view each other's profiles and exchange messages in chat channels.
- **`UNMATCHED`**:
  - **Description**: One of the users explicitly broke the connection.
  - **Permissions**: Profile visibility is removed and messaging access is immediately revoked.
- **`BLOCKED`**:
  - **Description**: One of the users blocked the other.
  - **Permissions**: Restricts all interactions. The blocked profile cannot search for, view, or attempt to re-like the blocker.
