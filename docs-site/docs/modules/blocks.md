---
sidebar_position: 16
---

# Blocks Module

The `BlocksModule` manages user-to-user blocking relationships, enforcing safety boundaries and restricting interactions across all modules.

---

## 📋 Purpose & System Role

This module acts as the system-wide safety filter. It maintains the database of user blocks and coordinates with the matching, liking, searching, and messaging modules to block all communication between restricted accounts.

---

## 🧠 Business Logic & Core Concepts

### 1. Self-Block Prevention
The `create` method strictly validates that `blockerUserId !== blockedUserId`. This prevents malicious or accidental API calls from bricking a user's own account.

### 2. Reactivation over Duplication
If a user blocks someone, unblocks them, and then decides to block them again, the service does not create a duplicate row. Instead, it finds the soft-deleted block record, sets `deletedAt` back to `null`, and resets `createdAt` to the current timestamp. This keeps the database normalized and prevents duplicate pair clutter while maintaining an accurate "new" block date for sorting.

### 3. Bidirectional Mutual Exclusivity
The internal `isBlocked` guard method is exposed to other modules (like Liking and Matching). It runs a highly optimized `OR` query to check if *either* user blocked the other. If an active block exists in any direction, interactions are halted.

### 4. Cross-Module Interaction Filtering
The module acts as a gatekeeper across the platform. Whenever a query is run or an action is initiated, other modules consult the `BlocksService` to filter results:
- **Search & Discovery**: Blocked users are hidden from matching pools and search recommendations.
- **Likes**: Users cannot send likes to users who have blocked them, or whom they have blocked.
- **Chats**: Text routing is blocked if a block relation exists between the participants.

### 2. Automatic Match Severing (Cascade Deletions)
When User A blocks User B, the system must immediately terminate any active connection to prevent further contact. The service runs a cascade transaction that:
1. Locates any existing `Match` record between the two users.
2. Updates the `Match` status column from `ACTIVE` to `BLOCKED`.
3. Voids any pending `Like` records sent between the two profiles.
4. Revokes active chat channel access.

### 3. Soft-Delete Auditing (Unblocking Lifecycle)
When a user decides to unblock another profile, the block record is not permanently deleted from the database. Instead:
- **Logical Soft-Delete**: The record's `deletedAt` field is set to the current timestamp.
- **Moderation History**: Soft-deleting block records preserves a full audit trail of blocking activities, which is critical for support teams to analyze harassment patterns or report loops.
- **Access Restored**: An unblocked user immediately regains normal platform visibility, allowing them to appear in search pools and send likes again.
