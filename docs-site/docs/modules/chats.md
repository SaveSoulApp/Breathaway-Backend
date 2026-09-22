---
sidebar_position: 17
title: Chats Module
description: Authoritative 1:1 chat messaging, IDOR protection, dating invariant enforcement, and Supabase Realtime synchronization.
---

# Chats Module

The `ChatsModule` owns user-to-user 1:1 real-time messaging, conversation history retrieval, watermark read receipts, and synchronization with Supabase Realtime. It implements **strict zero-trust authorization** and **dating invariant enforcement** to guarantee platform safety, privacy, and harassment prevention.

---

## 📋 Purpose & System Role

- **Authoritative Messaging Gateway**: All message creation flows through the backend API (`POST /api/v1/chats/messages`), validating business invariants before persisting to Supabase and broadcasting to clients.
- **IDOR Protection & Channel Isolation**: Prevents unauthorized access or eavesdropping on private conversations by strictly asserting participant membership on every room-level operation.
- **Dating Invariant & Safety Enforcement**: Blocks unauthorized messaging between users who are not actively matched, have unmatched, or where an active block relationship exists.
- **Supabase Realtime Token Minting**: Signs asymmetric `ES256` JWTs scoped to the authenticated user for secure WebSocket channel subscriptions.
- **Account Lifecycle Cleanup**: Listens to `USER_DELETED_EVENT` to automatically purge chat rooms and message history from Supabase when an account is deleted.

---

## 🔒 Critical Security & Safety Invariants

### 1. IDOR Defense (`assertRoomParticipant`)

Insecure Direct Object Reference (IDOR) vulnerabilities occur when an API endpoint relies solely on a user-provided resource ID without verifying ownership. 

Because `ChatRoom.id` is a UUID that could be logged, intercepted, or leaked, **the backend never assumes a caller is allowed to view or mutate a room based solely on its UUID**.

Before executing message retrieval (`GET /chats/:roomId/messages`) or marking messages as read (`POST /chats/:roomId/messages/read`), `ChatsService` executes `assertRoomParticipant(userId, roomId)`:

```typescript
// Fetches the room and verifies the caller is userOneId or userTwoId
const room = await this.supabase
  .from('ChatRoom')
  .select('id, userOneId, userTwoId')
  .eq('id', roomId)
  .single();

if (!room) {
  throw new ChatRoomNotFoundException(roomId); // 404 Not Found
}

if (room.userOneId !== userId && room.userTwoId !== userId) {
  throw new ChatRoomAccessForbiddenException(roomId); // 403 Forbidden
}
```

- **HTTP 404 Not Found**: Thrown when the room does not exist (`CHAT_ROOM_NOT_FOUND`).
- **HTTP 403 Forbidden**: Thrown when an authenticated user attempts to access a conversation they are not a participant in (`CHAT_ROOM_ACCESS_FORBIDDEN`).

---

### 2. Dating Invariant Enforcement in `sendMessage()`

Before any message is written or transmitted, `ChatsService.sendMessage()` enforces three mandatory gates:

```
                          POST /chats/messages
                                  │
                                  ▼
                    [ 1. Self-Message Guard ]
                      senderId === targetUserId ?
                       ├── YES ──► Throw SelfMessageException (400)
                       └── NO
                                  │
                                  ▼
           [ 2. Concurrent Safety Checks (Promise.all) ]
           ┌───────────────────────────────────────────┐
           │ • BlocksService.isBlocked(sender, target) │
           │ • prisma.match.findFirst(ACTIVE match)    │
           └───────────────────────────────────────────┘
                                  │
                  Active Block Exists?
                   ├── YES ──► Throw UserBlockedException (403)
                   └── NO
                                  │
                  Active Match Missing / Unmatched?
                   ├── YES ──► Throw ActiveMatchRequiredException (403)
                   └── NO
                                  │
                                  ▼
                   Idempotent ChatRoom Upsert &
                      Message Write (Supabase)
```

#### A. Self-Message Prevention
Users cannot message themselves. Evaluated synchronously before database operations:
- Throws `SelfMessageException` (`400 Bad Request` / `SELF_MESSAGE_FORBIDDEN`).

#### B. Bidirectional Block Enforcement (Zero-Tolerance Safety)
A user cannot message someone they have blocked, nor can they message someone who has blocked them:
- Evaluates `BlocksService.isBlocked(senderId, targetUserId)` which checks for active blocks (`deletedAt: null`) in either direction.
- If a block exists, immediately throws `UserBlockedException` (`403 Forbidden` / `USER_BLOCKED`).

#### C. Active Match Requirement
Messages can only be exchanged between users who currently hold a valid, mutual `Match`:
- Queries `prisma.match.findFirst` requiring:
  - `status: MatchStatus.ACTIVE`
  - `deletedAt: null` (match not unmatched or dissolved)
  - `userOne: { deletedAt: null }` and `userTwo: { deletedAt: null }` (neither account deactivated)
- If the users were never matched or previously unmatched, throws `ActiveMatchRequiredException` (`403 Forbidden` / `ACTIVE_MATCH_REQUIRED`).

---

### 3. Inbox Block Filtering in `getRooms()`

When a user calls `GET /api/v1/chats/rooms`, the service queries active blocks involving the caller (`prisma.block.findMany`). Any chat rooms where the other participant is blocked are **filtered out in-memory** before profile enrichment. 

This ensures that blocked users never appear in the active conversation list, preventing accidental contact or harassment triggers in the UI.

---

## ⚡ Performance Architecture: Database Concurrency vs. Caching

During high-frequency chat messaging, evaluating blocks and match status on every message could appear redundant. However, an in-depth architectural evaluation demonstrates why **direct concurrent database queries are superior to caching** in this domain:

### Why Local In-Memory Caching is Prohibited on Cloud Run
Cloud Run scales horizontally across multiple stateless container instances:
- If User A blocks User B on Container 1, Container 2's local RAM cache would still consider User B unblocked until the TTL expires.
- This creates a **"Harassment Window"** where a blocked user could continue messaging the victim, violating safety compliance and App Store policies.

### Why Concurrent Database Lookups are Optimal
Both `Block` (`@@unique([blockerUserId, blockedUserId])`) and `Match` (`@@unique([userOneId, userTwoId])`) use primary/unique B-tree indexes. An indexed point lookup in PostgreSQL Cloud SQL takes **~0.4 – 0.5 ms**.

By parallelizing these checks via `Promise.all`:
```typescript
const [isBlocked, activeMatch] = await Promise.all([
  this.blocksService.isBlocked(senderId, targetUserId),
  this.prisma.match.findFirst({
    where: {
      OR: [
        { userOneId: senderId, userTwoId: targetUserId },
        { userOneId: targetUserId, userTwoId: senderId },
      ],
      status: MatchStatus.ACTIVE,
      deletedAt: null,
      userOne: { deletedAt: null },
      userTwo: { deletedAt: null },
    },
    select: { id: true },
  }),
]);
```
- **Total Overhead**: ~0.5 ms (executed concurrently against the connection pool).
- **Consistency**: 100% strict consistency with zero stale windows.
- **Simplicity**: Eliminates the need for distributed cache invalidation hooks across `BlocksService`, `MatchesService`, and `ProfilesService`.

---

## 🧠 Core Business Logic & Supabase Integration

### 1. Authoritative Supabase Writes
While Supabase Realtime handles client WebSockets, the NestJS backend handles all message creation using the `SUPABASE_SERVICE_ROLE_KEY`. This bypasses Supabase RLS for server writes, guaranteeing that business rules, blocks, and active matches are authoritatively checked before any row is written.

### 2. Idempotent Room Ordering
To avoid race conditions when two users message each other simultaneously, room participant IDs are sorted lexicographically (`userOneId < userTwoId` via `generateRoomParticipants`). The room is upserted with `onConflict: 'userOneId, userTwoId'`:
```typescript
export function generateRoomParticipants(id1: string, id2: string) {
  return id1 < id2
    ? { userOneId: id1, userTwoId: id2 }
    : { userOneId: id2, userTwoId: id1 };
}
```

### 3. Watermark Read Receipts
Instead of acknowledging messages individually, `markMessageRead(userId, roomId, dto)` uses a watermark timestamp. Given a reference `messageId`, it stamps `readAt = NOW()` on all unread messages in the room sent by the *other* participant that were created at or before that message's `createdAt`.

### 4. Asynchronous Push Notifications
Push notifications to the recipient are triggered fire-and-forget after message insertion. Any failure in notification delivery is logged with structured error context but does not fail the HTTP request.

---

## 🛠 API Endpoints & Error Matrix

All routes are prefixed with `/api/v1/chats` and require `Bearer <JWT>` authentication (`JwtAuthGuard`).

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/chats/supabase-token` | Mints an ES256 JWT for Supabase Realtime WebSocket connection | Yes |
| `POST` | `/chats/messages` | Sends a message, creating the room idempotently if needed | Yes |
| `GET` | `/chats/rooms` | Lists active conversations for the caller, enriched with profiles | Yes |
| `GET` | `/chats/:roomId/messages` | Paginated messages for a conversation (IDOR guarded) | Yes |
| `POST` | `/chats/:roomId/messages/read` | Marks messages up to watermark as read (IDOR guarded) | Yes |

### Domain Exception Matrix

All exceptions return standard RFC 7807 `application/problem+json` error responses:

| Exception Class | HTTP Status | Error Code (`type`) | Trigger Condition |
| :--- | :--- | :--- | :--- |
| `SelfMessageException` | `400 Bad Request` | `SELF_MESSAGE_FORBIDDEN` | Caller attempts to send a message to their own `userId`. |
| `ChatRoomNotFoundException` | `404 Not Found` | `CHAT_ROOM_NOT_FOUND` | Specified `roomId` does not exist in the database. |
| `ChatRoomAccessForbiddenException` | `403 Forbidden` | `CHAT_ROOM_ACCESS_FORBIDDEN` | Caller is not a participant (`userOneId` or `userTwoId`) in the room. |
| `UserBlockedException` | `403 Forbidden` | `USER_BLOCKED` | An active block exists between the sender and target user. |
| `ActiveMatchRequiredException` | `403 Forbidden` | `ACTIVE_MATCH_REQUIRED` | No mutual active match exists, or users have unmatched. |
| `MessageNotFoundException` | `404 Not Found` | `MESSAGE_NOT_FOUND` | Reference message not found when updating read status. |

---

## 📁 Key Files & References

- **Controller**: [`src/modules/chats/chats.controller.ts`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/chats/chats.controller.ts)
- **Service**: [`src/modules/chats/chats.service.ts`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/chats/chats.service.ts)
- **Token Service**: [`src/modules/chats/services/supabase-auth.service.ts`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/chats/services/supabase-auth.service.ts)
- **Domain Exceptions**: [`src/modules/chats/application/exceptions/`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/chats/application/exceptions/)
- **Room Utilities**: [`src/modules/chats/utils/chats.utils.ts`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/chats/utils/chats.utils.ts)
- **Realtime Infrastructure Runbook**: [`docs-site/docs/architecture/supabase-realtime.md`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/docs-site/docs/architecture/supabase-realtime.md)
