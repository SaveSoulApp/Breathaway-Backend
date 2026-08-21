---
sidebar_position: 5
title: Supabase Realtime Architecture
---

# Supabase Realtime Architecture

BreathAway uses a decoupled microservice architecture for the chat system. While the core application (Users, Matches, Subscriptions) is managed by Prisma and a primary PostgreSQL database, the high-volume, real-time messaging data is entirely offloaded to a separate **Supabase PostgreSQL Database**.

This document explains how this architecture works under the hood, how to set it up for the first time, and how to safely run migrations without breaking the separation of concerns.

---

## 🏗️ Architecture Overview

The architecture splits responsibilities to prevent chat volume from degrading core API performance:

1. **Primary Database (Prisma)**
   - Manages the `User`, `UserProfile`, `Match`, and `Like` tables.
   - Accessed strictly via Prisma ORM (`PrismaService`).
   - Does **not** know about chat rooms or messages.

2. **Chat Database (Supabase)**
   - Manages the `ChatRoom` and `Message` tables.
   - Accessed natively via the `@supabase/supabase-js` client.
   - Supabase Realtime sits on top of this database, listening to PostgreSQL replication logs (wal2json) and broadcasting `INSERT/UPDATE` events over WebSockets to the React Native mobile app.

### API Composition (The Bridge)
Because the databases are physically separated, we cannot use SQL `JOIN`s to fetch a user's name alongside their chat room. Instead, we use the **API Composition Pattern** in `ChatsService.getRooms()`:
1. Fetch 20 `ChatRoom` rows from Supabase.
2. Extract the unique `otherUserId`s from the results in-memory.
3. Make a single, highly optimized `PrismaService.userProfile.findMany({ where: { userId: { in: otherUserIds } } })` query to the primary DB.
4. Merge the names (`firstName`, `lastName`) back into the response payload as the `otherUser` object.

---

## 🚀 Setting it up for the first time

To initialize the Supabase database for a new environment, you **must not** add these tables to `schema.prisma`. 

Instead, we maintain raw SQL scripts in `supabase/migrations/` in the repository root.

**Step 1: Create the tables in Supabase**
Go to the **Supabase Dashboard -> SQL Editor** and run the initial migration script: `supabase/migrations/20260730000000_init_chat_schema.sql`.

**Step 2: What the script does**
- Creates `ChatRoom` and `Message` tables using `uuid` primary keys.
- Sets `userOneId`, `userTwoId`, and `senderId` as plain `text` columns to store the ULIDs from our primary database (enforcing decoupling).
- Executes `alter publication supabase_realtime add table "Message";` to explicitly tell the Realtime engine to broadcast WebSocket events for these tables.
- Enables **Row Level Security (RLS)** using `(auth.jwt() ->> 'sub')` so the frontend React Native app can safely subscribe to channels without seeing other users' messages.

---

## 🗄️ Database Migrations

Because the systems are decoupled, migrations are completely isolated.

### Modifying the Primary DB
- Run `npx prisma migrate dev` as normal.
- **Impact on Chats:** Zero. The chat database will not be affected. Note that because there are no strict Foreign Keys between the databases, if you delete a `User` in Prisma, their chat history remains in Supabase unless your backend explicitly deletes it via a Supabase API call.

### Modifying the Chat DB
- Create a new `.sql` file in `supabase/migrations/`.
- Run the raw SQL in the Supabase Dashboard SQL Editor (or use the Supabase CLI: `supabase db push`).
- **Impact on Prisma:** Zero. Your `schema.prisma` will not complain because it doesn't know the chat tables exist.

---

## 🔐 Authentication & RLS 

The backend and frontend interact with Supabase differently:

**The Backend (NestJS)**
The `ChatsService` initializes the Supabase client using the `SUPABASE_SERVICE_ROLE_KEY`. This is a master key that **bypasses Row Level Security (RLS)**. The backend handles all the INSERTS and UPDATES natively, ensuring data integrity.

**The Frontend (React Native)**
The mobile app does not have the Service Role Key. Instead:
1. It calls `GET /api/v1/chats/supabase-token`.
2. `SupabaseAuthService` mints a short-lived, custom JWT signed with `SUPABASE_JWT_PRIVATE_KEY` where the `sub` claim is the user's ULID.
3. The mobile app connects to Supabase WebSockets using this custom JWT.
4. The Supabase RLS policies (e.g., `USING ((auth.jwt() ->> 'sub') = "userOneId")`) securely parse the ULID out of the token and restrict the WebSocket stream so the user only receives their own messages.

---

## ⚠️ Future Amendments (For AI and Developers)

If you need to change the chat system in the future, adhere strictly to these rules:
1. **NEVER** add `ChatRoom` or `Message` to `schema.prisma`.
2. **NEVER** use `auth.uid()` in Supabase RLS policies. The primary database uses 26-character ULIDs, but `auth.uid()` strictly expects a UUID. You must always extract the ID via `(auth.jwt() ->> 'sub')`.
3. Keep the `supabase/migrations/` folder as the absolute source of truth for the Chat DB schema.
4. Only grant `SELECT` access in Supabase RLS. Write operations (`INSERT`/`UPDATE`) should always flow through the NestJS backend to enforce business logic (e.g., verifying if the users are actively matched before allowing a message).
