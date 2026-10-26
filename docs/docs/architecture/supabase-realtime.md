---
sidebar_position: 5
title: Supabase Realtime Architecture & Setup
---

# Supabase Realtime Architecture & Infrastructure Setup

BreathAway uses a **two-layer ownership model** for the chat system. The table DDL for `ChatRoom` and `Message` is owned and evolved by Prisma (preventing schema drift with Cloud SQL). The Supabase-specific infrastructure — the `supabase_realtime` logical replication publication and Row Level Security (RLS) policies — is managed via SQL in `supabase/migrations/` and applied once per environment via the Supabase Dashboard.

This document serves as the **definitive operational guide** for configuring, maintaining, and future-proofing the Supabase Realtime chat infrastructure across all environments (**Development, Staging, and Production**).

---

## 🏗️ Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                          NestJS Backend Service                        │
│                                                                        │
│   POST /chats/messages           GET /chats/supabase-token             │
│   (Server-side Write)            (Mints ES256 JWT with kid & aud)      │
│                                  GET /chats/rooms/:roomId/key          │
│                                  (Unwraps room DEK for client)         │
└───────────────┬──────────────────────────────────┬─────────────────────┘
                │ Service Role Key                 │ Signed Client JWT &
                │ (Bypasses RLS)                   │ Raw 32-byte Room Key
                ▼                                  ▼
┌─────────────────────────────────┐   ┌──────────────────────────────────┐
│      PostgreSQL Database        │   │     Supabase Realtime Engine     │
│   (Cloud SQL / Supabase DB)     │   │      (WebSockets Endpoint)       │
│                                 │   │                                  │
│  • ChatRoom (wrappedRoomKey)    │   │  • Validates JWT via JWKS (kid)  │
│  • Message  (encrypted content) │   │  • Enforces RLS on subscriptions │
│                                 │   │  • Dispatches ciphertext events  │
│  ┌───────────────────────────┐  │   └─────────────────▲────────────────┘
│  │ supabase_realtime pub     │──┼─── WAL Replication ─┘
│  │ (Logical Replication)     │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘                     │ Live Ciphertext Stream
                                                        │ (enc:v1:...)
                                                        ▼
                                      ┌──────────────────────────────────┐
                                      │  Client Apps (Mobile & Web)      │
                                      │  • Local WebCrypto Decryption    │
                                      │  • Sub-millisecond rendering     │
                                      └──────────────────────────────────┘
```

### Layer 1 — Table DDL (Prisma & Supabase)

`ChatRoom` and `Message` are declared in [`prisma/schema.prisma`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/prisma/schema.prisma). Prisma owns:

- Table creation, column definitions, constraints, and indexes.
- **Database-Level UUID Generation**: Both tables use `@default(dbgenerated("gen_random_uuid()")) @db.Uuid`. This is critical because server-side writes originating from `@supabase/supabase-js` (PostgREST) do not generate IDs client-side like Prisma Client does. The PostgreSQL engine itself must supply the default UUID upon `INSERT`.
- **Field-Level Encryption at Rest (DB-01)**: `ChatRoom` holds `wrappedRoomKey TEXT NOT NULL` (the Base64-encoded AES-256 room data key, wrapped with the active GCP Secret Manager master key) and `roomKeyId VARCHAR(64) NOT NULL` (the key identifier, e.g. `chat-v1`). All records in `Message.content` are strictly encrypted as `enc:v1:<ivBase64>:<tagBase64>:<ciphertextBase64>`. Zero plaintext is ever written to disk.

### Layer 2 — Supabase Infrastructure (`supabase/migrations/`)

The following are **Supabase-specific** and live exclusively in [`supabase/migrations/20261026133609_chat_realtime_setup.sql`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/supabase/migrations/20261026133609_chat_realtime_setup.sql):

- `ALTER PUBLICATION supabase_realtime ADD TABLE ...` — registers the tables with the logical replication stream.
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` — ensures direct client access is locked down.
- `CREATE POLICY ... FOR SELECT USING ((auth.jwt() ->> 'sub') = ...)` — restricts client read streams to rooms the user participates in.

### API Composition (The Profile Bridge)

Because `userOneId`, `userTwoId`, and `senderId` are plain `text` columns storing ULIDs from the primary database, we cannot use SQL `JOIN`s across disparate services. Instead, `ChatsService.getRooms()` uses the **API Composition Pattern**:

1. Fetches `ChatRoom` rows via the Supabase client using the master `SUPABASE_SERVICE_ROLE_KEY`.
2. Extracts unique participant IDs in-memory.
3. Batches a single `prisma.userProfile.findMany({ where: { userId: { in: otherUserIds } } })` query.
4. Merges user names and profile metadata into the response before returning to the client.

---

## 🚀 Step-by-Step Runbook: Setting Up Chat Infra for a New Environment / Fresh Project

Follow this guide when configuring a fresh Supabase project, migrating to a new organization/account, or setting up a new environment (**Development, Staging, or Production**).

---

### 🔑 Critical Concept: Understanding the Credentials & The Asymmetric JWT Model

When setting up or migrating to a fresh Supabase project, you must extract and configure **6 core variables**.

A common point of confusion is: **Where do `SUPABASE_JWT_PRIVATE_KEY` and `SUPABASE_JWT_KEY_ID` come from?**

> [!IMPORTANT]
> **The Supabase Dashboard DOES NOT generate or provide the `SUPABASE_JWT_PRIVATE_KEY`.**
>
> BreathAway uses **asymmetric ES256 (ECDSA P-256)** signing for chat tokens:
>
> - **The Private Key (`SUPABASE_JWT_PRIVATE_KEY`)** belongs to **you**. You generate it locally or retrieve it from GCP Secret Manager. It lives strictly inside your backend service and GCP Secret Manager. It is **never** shared with clients.
> - **The Public Key (JWK)** is exported from your private key and **imported into the Supabase Dashboard**.
> - **The Key ID (`SUPABASE_JWT_KEY_ID`)** is generated and assigned by the **Supabase Dashboard** once you import your JWK key and promote/rotate it to active. Supabase uses this `kid` to match incoming client WebSocket tokens against the public key in its JWKS keystore.

#### Complete Credentials Inventory Checklist

| Variable Name               | Port / Location in Supabase Dashboard                                                 | Description & Role                                                                                      | Where Stored / Configured                                       |
| :-------------------------- | :------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------- |
| `DIRECT_URL`                | **Project Settings → Database** (Connection string: **Session mode / Port 5432**)     | Direct connection for Prisma migrations and schema DDL (`prisma migrate`).                              | Local `.env` & CI/CD migration runners                          |
| `DATABASE_URL`              | **Project Settings → Database** (Connection string: **Transaction mode / Port 6543**) | Pooled connection for high-throughput runtime queries via Supabase Supavisor pooler.                    | GCP Secret Manager (`database-url`) & local `.env`              |
| `SUPABASE_URL`              | **Project Settings → API** (`https://<project-ref>.supabase.co`)                      | Base REST / WebSocket endpoint for the Supabase project.                                                | GCP Secret Manager (`supabase-url`) & local `.env`              |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project Settings → API** (Project API Keys: `service_role` secret)                  | High-privilege administrative key that bypasses Row Level Security (RLS) for backend operations.        | GCP Secret Manager (`supabase-service-role-key`) & local `.env` |
| `SUPABASE_JWT_PRIVATE_KEY`  | **Locally generated OR GCP Secret Manager** (`supabase-jwt-private-key`)              | EC P-256 private key used by NestJS backend to sign short-lived client JWTs. **Not found in Supabase!** | GCP Secret Manager (`supabase-jwt-private-key`) & local `.env`  |
| `SUPABASE_JWT_KEY_ID`       | **Project Settings → API → JWT Signing Keys** (Key ID column)                         | Key ID UUID (`kid`) assigned by Supabase _after_ you import your JWK and rotate to active.              | `scripts/deploy/common.<env>.sh` & local `.env`                 |

---

### Step 1: Run the Prisma Database Migration

The database tables must exist with database-level `gen_random_uuid()` defaults before wiring into Supabase.

For Development:

```bash
pnpm run migrate:dev
```

For Production:

```bash
pnpm run migrate:prod
```

Verify that the tables exist in PostgreSQL with default generators:

```sql
SELECT column_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_name IN ('ChatRoom', 'Message') AND column_name = 'id';
-- Both must show column_default = gen_random_uuid()
```

---

### Step 2: Apply Supabase Realtime Publication & RLS

Open the **Supabase Dashboard → SQL Editor** for the target environment and execute [`supabase/migrations/20261026133609_chat_realtime_setup.sql`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/supabase/migrations/20261026133609_chat_realtime_setup.sql):

```sql
-- 1. Wire both tables into Supabase Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE "ChatRoom";
ALTER PUBLICATION supabase_realtime ADD TABLE "Message";

-- 2. Enable Row Level Security
ALTER TABLE public."ChatRoom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;

-- 3. Client RLS: Users can only READ chat rooms they participate in
CREATE POLICY "Users can read their own chat rooms"
ON public."ChatRoom"
FOR SELECT
USING ((auth.jwt() ->> 'sub') = "userOneId" OR (auth.jwt() ->> 'sub') = "userTwoId");

-- 4. Client RLS: Users can only READ messages in their chat rooms
CREATE POLICY "Users can read messages in their chat rooms"
ON public."Message"
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public."ChatRoom"
    WHERE "ChatRoom"."id" = "Message"."roomId"
    AND (
      (auth.jwt() ->> 'sub') = "ChatRoom"."userOneId"
      OR (auth.jwt() ->> 'sub') = "ChatRoom"."userTwoId"
    )
  )
);
```

> [!IMPORTANT]
> Client access is strictly `FOR SELECT`. Clients **never** write directly to Supabase via WebSockets or the Supabase client. All message sends, read receipts, and deletions MUST pass through the NestJS backend API (`POST /api/v1/chats/messages`).

---

### Step 3: Asymmetric JWT Signing Key Setup (ES256 & `kid`)

Supabase Realtime verifies incoming tokens using its **JWT Signing Keys** system (JWKS). Custom JWTs signed by our backend using `ES256` require a matching public key and Key ID (`kid`) in Supabase.

#### A. Generate or Locate the ES256 Private Key (`SUPABASE_JWT_PRIVATE_KEY`)

You can either reuse the existing key from GCP Secret Manager or generate a brand-new one:

**Option 1: Reuse existing key from GCP Secret Manager (Recommended when migrating existing environment)**:

```bash
gcloud secrets versions access latest --secret="supabase-jwt-private-key" --project="<PROJECT_ID>"
```

**Option 2: Generate a brand-new EC P-256 key pair (When starting fresh)**:

```bash
openssl ecparam -name prime256v1 -genkey -noout -out supabase-jwt-private-key.pem
```

Store this private key securely in **GCP Secret Manager** as `supabase-jwt-private-key` (and in local `.env` as `SUPABASE_JWT_PRIVATE_KEY`).

#### B. Export the Key in Supabase JWK Format

Supabase requires the key to be imported in **JWK (JSON Web Key)** format. Run the repository helper script [`scripts/utils/export-supabase-public-key.ts`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/scripts/utils/export-supabase-public-key.ts):

```bash
# If using local PEM file:
SUPABASE_JWT_PRIVATE_KEY="$(cat supabase-jwt-private-key.pem)" npx ts-node scripts/utils/export-supabase-public-key.ts

# Or if using GCP Secret Manager:
SUPABASE_JWT_PRIVATE_KEY="$(gcloud secrets versions access latest --secret=supabase-jwt-private-key --project=<PROJECT_ID>)" npx ts-node scripts/utils/export-supabase-public-key.ts

# Or if SUPABASE_JWT_PRIVATE_KEY is already loaded in your .env:
node --env-file=.env -r ts-node/register scripts/utils/export-supabase-public-key.ts
```

The script will output the full JWK:

```json
{
  "kty": "EC",
  "x": "...",
  "y": "...",
  "crv": "P-256",
  "d": "..."
}
```

Copy the entire JSON output (including the outer `{ }` curly braces).

#### C. Import into Supabase Dashboard & Retrieve Key ID (`SUPABASE_JWT_KEY_ID`)

1. Open the [Supabase Dashboard](https://supabase.com/dashboard) for your new project.
2. In the left-hand navigation bar, click **Project Settings** (gear icon at bottom left).
3. Under Settings, navigate to **API** (or **Authentication** → **JWT Settings** depending on dashboard version).
4. Scroll to the **JWT Signing Keys** section.
5. Click **Create standby key**.
6. Select the checkbox **"Import an existing private key"**.
7. Paste the complete JWK JSON string from Step B into the text input.
8. Click **Create standby key** to save.
9. Locate the newly created standby key in the table, and click **Rotate keys** (or select **Make active / Rotate** from the `...` menu) to promote it to the active ("Current") key.
10. In the **Key ID** column for that active key row, copy the UUID string (e.g. `709ac6ba-a048-4f39-a6ce-c1f9c993b98b`).
11. **This UUID is your `SUPABASE_JWT_KEY_ID`.**

---

### Step 4: Environment Variables & Deployment Configuration

Each environment requires 4 key configuration items. Distribute them according to security tier:

| Variable Name               | Description                                           | Sensitivity             | Storage Location                                          |
| :-------------------------- | :---------------------------------------------------- | :---------------------- | :-------------------------------------------------------- |
| `SUPABASE_URL`              | Supabase project URL (`https://<ref>.supabase.co`)    | Sensitive / Environment | GCP Secret Manager (`supabase-url`) & `.env`              |
| `SUPABASE_SERVICE_ROLE_KEY` | Master server-side key (bypasses RLS)                 | **High Secret**         | GCP Secret Manager (`supabase-service-role-key`) & `.env` |
| `SUPABASE_JWT_PRIVATE_KEY`  | ES256 private key used by backend to sign client JWTs | **High Secret**         | GCP Secret Manager (`supabase-jwt-private-key`) & `.env`  |
| `SUPABASE_JWT_KEY_ID`       | Key ID (`kid`) matching Supabase JWT Signing Keys     | Non-sensitive           | `scripts/deploy/common.<env>.sh` & `.env`                 |

#### Updating Deployment Scripts:

1. In `scripts/deploy/common.dev.sh` or `scripts/deploy/common.prod.sh`:
   ```bash
   export SUPABASE_JWT_KEY_ID='your-assigned-kid-here'
   ```
2. Verify `scripts/deploy/deploy.sh` binds the secrets and environment variables:
   - Secret bindings: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_PRIVATE_KEY`.
   - Environment variables: `"SUPABASE_JWT_KEY_ID=${SUPABASE_JWT_KEY_ID:-}"`.
3. Deploy the backend service:
   ```bash
   pnpm run deploy:dev   # or deploy:prod
   ```

---

### Step 5: Client-Side Integration (Mobile App & Web Frontend)

#### ⚠️ Critical Pitfall: The WebSocket Authorization Trap

Setting the JWT only in global HTTP headers (`{ headers: { Authorization: 'Bearer ...' } }`) **will silently fail for Realtime**. The WebSocket connection will establish without errors, but Supabase Realtime will treat the connection as an unauthenticated anonymous user, and RLS will filter out 100% of messages.

#### The Correct Client Implementation

1. **Retrieve the Custom JWT**:

   ```typescript
   const { token } = await api.get<{ token: string }>(
     '/api/v1/chats/supabase-token',
   );
   ```

2. **Pass Explicitly to Realtime**:

   ```typescript
   import { createClient } from '@supabase/supabase-js';

   // Method A: Set auth dynamically on an existing Supabase instance
   await supabase.realtime.setAuth(token);

   // Method B: Pass accessToken provider during client instantiation
   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
     accessToken: async () => token,
   });
   ```

3. **Subscribe to Room Channels**:
   ```typescript
   const channel = supabase
     .channel(`room:${roomId}`)
     .on(
       'postgres_changes',
       {
         event: 'INSERT',
         schema: 'public',
         table: 'Message',
         filter: `roomId=eq.${roomId}`,
       },
       (payload) => {
         console.log('New message received live:', payload.new);
       },
     )
     .subscribe((status) => {
       console.log('Realtime subscription status:', status);
     });
   ```

---

## 🔐 Client-Side Decryption & Room Key Handshake (WebCrypto)

Because all messages are encrypted at rest with room-level AES-256-GCM data keys (`enc:v1:<ivBase64>:<tagBase64>:<ciphertextBase64>`), frontend web and mobile clients decrypt messages locally using the native **W3C Web Crypto API** (`window.crypto.subtle`).

### Handshake Sequence

```
1. User clicks conversation
2. Client requests room key:
   GET /api/v1/chats/rooms/:roomId/key ────► [Backend verifies participant access]
   ◄── Returns { roomId, key, algorithm: "AES-GCM-256" }
3. Client imports raw 32-byte key via window.crypto.subtle.importKey()
4. Client fetches messages (Supabase PostgREST or Realtime WebSocket)
5. Client decrypts ciphertext locally in-browser (< 0.05ms)
```

### Frontend Implementation Reference (TypeScript / WebCrypto)

```typescript
// 1. Fetch the raw 32-byte room key from NestJS backend
const keyResponse = await fetch(`/api/v1/chats/rooms/${roomId}/key`, {
  headers: { Authorization: `Bearer ${userJwt}` },
});
const { key: base64Key } = await keyResponse.json();

// 2. Import into a native WebCrypto CryptoKey
const rawKeyBuffer = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
const cryptoKey = await window.crypto.subtle.importKey(
  'raw',
  rawKeyBuffer,
  { name: 'AES-GCM', length: 256 },
  false,
  ['decrypt'],
);

// 3. Decrypt incoming message payload (enc:v1:<iv>:<tag>:<ciphertext>)
async function decryptMessage(encryptedString: string): Promise<string> {
  const parts = encryptedString.split(':');
  if (parts.length < 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    throw new Error('Invalid encrypted payload format');
  }

  const iv = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  const tag = Uint8Array.from(atob(parts[3]), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(parts[4]), (c) => c.charCodeAt(0));

  // WebCrypto requires ciphertext and 16-byte authentication tag concatenated
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    cryptoKey,
    combined,
  );

  return new TextDecoder().decode(decryptedBuffer);
}
```

---

## 📋 Production Rollout Checklist

Before opening chat features to real users in production, ensure this checklist is complete:

- [ ] **DDL Applied**: `prisma migrate deploy` executed on Cloud SQL production database.
- [ ] **UUID Defaults Verified**: `ChatRoom.id` and `Message.id` have `DEFAULT gen_random_uuid()`.
- [ ] **RLS & Publication Applied**: `supabase/migrations/20261026133609_chat_realtime_setup.sql` executed in production Supabase SQL Editor.
- [ ] **Publication Enabled**: `ChatRoom` and `Message` tables confirmed in `supabase_realtime` publication.
- [ ] **Production Key Imported**: Production ES256 key imported into production Supabase JWT Signing Keys.
- [ ] **Key Rotated**: Production key promoted to "Current" in Supabase Dashboard.
- [ ] **Secrets Stored**: `supabase-url`, `supabase-service-role-key`, `supabase-jwt-private-key`, `gcp-secret-chat-master-keys`, and `active-chat-master-key-id` stored in GCP Secret Manager (`breathaway` project).
- [ ] **Key ID Configured**: `SUPABASE_JWT_KEY_ID` configured in `scripts/deploy/common.prod.sh`.
- [ ] **Backend Deployed**: Cloud Run backend deployed with `deploy:prod`.
- [ ] **Token & Key Verified**: Tested `GET /api/v1/chats/supabase-token` and `GET /api/v1/chats/rooms/:roomId/key`.
- [ ] **Live Subscription Tested**: End-to-end WebSocket message delivery and in-browser WebCrypto decryption verified.

---

## 🛠️ Troubleshooting & Diagnostic Guide

### 1. `500 Internal Server Error: Failed to process chat room`

- **Cause**: PostgreSQL error `23502: null value in column "id" of relation "ChatRoom" violates not-null constraint`.
- **Diagnosis**: PostgREST upsert was sent without an `id`, and PostgreSQL has no default value.
- **Fix**: Run `ALTER TABLE "ChatRoom" ALTER COLUMN "id" SET DEFAULT gen_random_uuid(); ALTER TABLE "Message" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();`.

### 2. `"Failed to generate JWT signer, check your JWT secret or JWKS configuration"`

- **Cause**: Supabase Realtime received a JWT signed with `ES256` but either:
  1. The token header is missing `kid`.
  2. The `kid` does not match any key in Supabase's **JWT Signing Keys**.
- **Diagnosis**: Decode the token on [jwt.io](https://jwt.io) and inspect the `kid` header parameter. Compare with the keys list in Supabase Dashboard.
- **Fix**: Ensure `SUPABASE_JWT_KEY_ID` matches the active key's `kid` in Supabase, and restart/redeploy the backend.

### 3. Client connects to WebSocket successfully, but receives zero messages

- **Cause**: RLS policy evaluated to `false` because the client connected without authentication.
- **Diagnosis**: Check if `supabase.realtime.setAuth(token)` was called. If token was passed only in HTTP request headers, WebSockets ignore it.
- **Fix**: Call `await supabase.realtime.setAuth(token)` immediately after fetching the token from `/api/v1/chats/supabase-token`.

### 4. RLS Error: `auth.jwt() ->> 'sub'` does not match

- **Cause**: The `sub` claim in the minted JWT does not match `userOneId` or `userTwoId`.
- **Diagnosis**: Verify that the JWT `sub` contains the 26-character ULID of the user, matching the values stored in `ChatRoom`.
- **Fix**: Ensure `SupabaseAuthService.generateToken(userId)` receives the authenticated user's ULID.
