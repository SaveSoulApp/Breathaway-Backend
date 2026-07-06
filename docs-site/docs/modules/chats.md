---
sidebar_position: 17
---

# Chats Module

The `ChatsModule` manages user communication, text messages, channels, and conversation histories.

---

## 📋 Purpose & Responsibilities

- **Conversation Retrieval (`GET /conversations`)**: Lists active chat conversations for the authenticated user.
- **Message Operations**: Exposes endpoints to retrieve and write messages within a conversation channel.
- **Access Guarding**: Checks that a mutual `ACTIVE` match exists between the two users before permitting chat channel creation or message exchange.

---

## 🧠 Business Logic & Core Concepts

### 1. Supabase Backend Offloading
While most of the BreathAway backend relies on PostgreSQL via Prisma, the `ChatsService` directly integrates with Supabase (`@supabase/supabase-js`) using the service role key. This allows the high-volume, real-time messaging data to be offloaded to Supabase's managed infrastructure, bypassing Row-Level Security (RLS) for authoritative server-side message injection.

### 2. Idempotent Room Initialization
When sending a message, the service does not assume a chat room exists. It generates deterministic participant IDs and executes a Supabase `upsert` with an `onConflict` clause. This gracefully prevents race conditions if two matched users attempt to send their first message to each other at the exact same millisecond.

### 3. "Watermark" Read Receipts
Instead of marking messages as read one-by-one, the `markMessageRead` method uses a high-watermark approach. When a client passes a reference `messageId`, the service stamps `readAt` on all unread messages sent by the *other* participant that were created at or before that reference message's timestamp in a single bulk operation.

### 4. Fire-and-Forget Notifications
Push notifications are triggered immediately after a message is persisted to Supabase, but they are deliberately caught and executed asynchronously (`.catch()`). This ensures that third-party notification failures or latency do not delay the API response for the sender.

---

## 🛠 File & Class Definitions

### Controller
- **[ChatsController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/chats/chats.controller.ts)**: Handles conversation and messaging endpoints.
  - Route Prefix: `/api/v1/chats`

### Service
- **[ChatsService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/chats/chats.service.ts)**: Validates active match states, saves messages, and notifies the target user using FCM push alerts.
