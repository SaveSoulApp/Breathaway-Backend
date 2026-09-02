---
sidebar_position: 5
title: Supabase Realtime Architecture
---

# Supabase Realtime Architecture

BreathAway uses a **two-layer ownership model** for the chat system. The table DDL for `ChatRoom` and `Message` is managed by Prisma (so `migrate dev` works without drift). The Supabase-specific infrastructure — the `supabase_realtime` publication and Row Level Security policies — is managed separately via raw SQL in `supabase/migrations/` and applied once per environment via the Supabase Dashboard.

---

## 🏗️ Architecture Overview

### Layer 1 — Table DDL (Prisma)

`ChatRoom` and `Message` are declared as standard models in `schema.prisma`. Prisma owns:
- The `CREATE TABLE` statements
- Column types, constraints, indexes
- Schema evolution via `migrate dev`

### Layer 2 — Supabase Infrastructure (supabase/migrations/)

The following are **Supabase-specific** and live exclusively in `supabase/migrations/`:
- `ALTER PUBLICATION supabase_realtime ADD TABLE ...` — registers the tables with the Realtime engine
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` — enables RLS
- `CREATE POLICY ... USING ((auth.jwt() ->> 'sub') = ...)` — client-facing access control

> [!IMPORTANT]
> Supabase Realtime is a PostgreSQL logical replication feature. It fires on **any** `INSERT`/`UPDATE`/`DELETE` to the registered tables — regardless of whether the writer is Prisma, the Supabase JS client, or raw SQL. Adding the models to Prisma does not affect Realtime behaviour.

### API Composition (The Bridge)

Because `userOneId`, `userTwoId`, and `senderId` are plain `text` columns storing ULIDs from the primary database, we cannot use SQL `JOIN`s. Instead, `ChatsService.getRooms()` uses the **API Composition Pattern**:

1. Fetch `ChatRoom` rows via the Supabase JS client (service-role key, bypasses RLS).
2. Extract unique `otherUserId`s in-memory.
3. Single `PrismaService.userProfile.findMany({ where: { userId: { in: otherUserIds } } })` call.
4. Merge names into the response payload.

---

## 🚀 Setting it up for a new environment

### Step 1: Run the Prisma migration (creates the tables)

```bash
pnpm run migrate:local   # or the equivalent deploy command for production
```

This creates `ChatRoom` and `Message` with indexes and constraints.

### Step 2: Apply the Supabase-specific infrastructure

Go to the **Supabase Dashboard → SQL Editor** and run:

```
supabase/migrations/20260730000000_init_chat_schema.sql
```

This file adds the tables to the `supabase_realtime` publication, enables RLS, and creates the client access policies. It is **idempotent-safe** to re-run only the publication and policy sections.

---

## 🗄️ Database Migrations

### Modifying the table structure (columns, indexes, constraints)

Edit `schema.prisma` and run:

```bash
pnpm run migrate:local
```

Prisma generates and applies the migration. **Impact on Realtime:** Zero — the publication and RLS policies are unaffected by DDL changes.

### Modifying Supabase-specific infrastructure (publication, RLS)

1. Create a new `.sql` file in `supabase/migrations/`.
2. Apply it via the **Supabase Dashboard SQL Editor**.
3. **Impact on Prisma:** Zero — `schema.prisma` does not declare publications or policies.

---

## 🔐 Authentication & RLS

**The Backend (NestJS)**
`ChatsService` initializes the Supabase client with `SUPABASE_SERVICE_ROLE_KEY`. This master key bypasses RLS so the backend can read and write all rooms and messages without restriction.

**The Frontend (React Native)**
1. Calls `GET /api/v1/chats/supabase-token`.
2. `SupabaseAuthService` mints a short-lived custom JWT signed with `SUPABASE_JWT_PRIVATE_KEY` where the `sub` claim is the user's ULID.
3. The mobile app connects to Supabase WebSockets using this JWT.
4. The RLS policies (`USING ((auth.jwt() ->> 'sub') = "userOneId")`) parse the ULID from the token and restrict the stream to the user's own messages.

---

## ⚠️ Rules for AI Agents and Developers

1. **NEVER** add `ALTER PUBLICATION supabase_realtime` or `CREATE POLICY ... auth.jwt()` to a Prisma migration — these are Supabase-specific and will fail on the shadow database.
2. **NEVER** use `auth.uid()` in Supabase RLS policies. The primary database uses 26-character ULIDs. Always use `(auth.jwt() ->> 'sub')`.
3. Only grant `SELECT` access in Supabase RLS. Write operations (`INSERT`/`UPDATE`) must always flow through the NestJS backend.
4. `ChatRoom` and `Message` are in `schema.prisma` — treat them like any other Prisma model for DDL changes. For Supabase infrastructure changes, use `supabase/migrations/`.
