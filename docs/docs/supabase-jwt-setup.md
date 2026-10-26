---
sidebar_position: 6
title: Supabase JWT & Credentials Setup Runbook
sidebar_label: Supabase JWT Setup
description: Step-by-step operational runbook to generate, export, import, and configure Supabase JWT Private Keys, Key IDs, and project credentials.
---

# 🔑 Supabase JWT & Credentials Setup Runbook

This guide is the **definitive step-by-step runbook** for extracting, generating, importing, and configuring Supabase credentials whenever provisioning a fresh Supabase project, moving to a new organization, or rotating JWT signing keys.

---

## ⚡ The Core Mental Model (Why Developers Get Confused)

When migrating to a new Supabase project, extracting the database URLs, project URL, and service role key is straightforward via the dashboard. However, developers frequently get stuck on **`SUPABASE_JWT_PRIVATE_KEY`** and **`SUPABASE_JWT_KEY_ID`**.

> [!IMPORTANT]
> **The Supabase Dashboard DOES NOT generate or provide the `SUPABASE_JWT_PRIVATE_KEY`.**
>
> BreathAway uses **asymmetric ES256 (ECDSA P-256)** signing for chat tokens:
>
> 1. **`SUPABASE_JWT_PRIVATE_KEY`**: Created and owned by **you** (stored in GCP Secret Manager & local `.env`). Our NestJS backend uses this to cryptographically sign short-lived client JWTs for chat sessions. It is **never** downloaded from Supabase and **never** exposed to client applications.
> 2. **Public Key (JWK)**: Exported from your private key and **imported into the Supabase Dashboard**.
> 3. **`SUPABASE_JWT_KEY_ID` (`kid`)**: Generated and assigned by the **Supabase Dashboard** after you import your signing key and rotate it to active. Supabase Realtime uses this `kid` to match incoming client WebSocket tokens against the public key in its JWKS keystore.

---

## 📋 Complete Credentials Inventory Checklist

When provisioning a fresh Supabase project, collect and distribute these 6 core parameters:

| Variable Name               | Port / Location in Supabase Dashboard                                                 | Description & Role                                                                                      | Target Destination                                              |
| :-------------------------- | :------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------- |
| `DIRECT_URL`                | **Project Settings → Database** (Connection string: **Session mode / Port 5432**)     | Direct connection for Prisma migrations and schema DDL (`prisma migrate`).                              | Local `.env` & CI/CD migration runners                          |
| `DATABASE_URL`              | **Project Settings → Database** (Connection string: **Transaction mode / Port 6543**) | Pooled connection for high-throughput runtime queries via Supabase Supavisor pooler.                    | GCP Secret Manager (`database-url`) & local `.env`              |
| `SUPABASE_URL`              | **Project Settings → API** (`https://<project-ref>.supabase.co`)                      | Base REST / WebSocket endpoint for the Supabase project.                                                | GCP Secret Manager (`supabase-url`) & local `.env`              |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project Settings → API** (Project API Keys: `service_role` secret)                  | High-privilege administrative key that bypasses Row Level Security (RLS) for backend operations.        | GCP Secret Manager (`supabase-service-role-key`) & local `.env` |
| `SUPABASE_JWT_PRIVATE_KEY`  | **Locally generated OR GCP Secret Manager** (`supabase-jwt-private-key`)              | EC P-256 private key used by NestJS backend to sign short-lived client JWTs. **Not found in Supabase!** | GCP Secret Manager (`supabase-jwt-private-key`) & local `.env`  |
| `SUPABASE_JWT_KEY_ID`       | **Project Settings → API → JWT Signing Keys** (Key ID column)                         | Key ID UUID (`kid`) assigned by Supabase _after_ you import your JWK and rotate to active.              | `scripts/deploy/common.<env>.sh` & local `.env`                 |

---

## 🚀 Step-by-Step Runbook to Obtain & Configure Both Values

Follow these 5 steps in order:

### Step 1: Obtain the Private Key (`SUPABASE_JWT_PRIVATE_KEY`)

You have two choices depending on whether you want to reuse an existing key or generate a fresh key pair:

#### Option A: Reuse Existing Key from GCP Secret Manager (Recommended for migrations)

If you already have a key saved in your GCP project's Secret Manager:

```bash
gcloud secrets versions access latest --secret="supabase-jwt-private-key" --project="<YOUR_GCP_PROJECT_ID>"
```

Copy the full PEM text (including `-----BEGIN EC PRIVATE KEY-----` and `-----END EC PRIVATE KEY-----`).

#### Option B: Generate a Brand New EC P-256 Key Pair (When starting fresh)

To create a clean new private key:

```bash
openssl ecparam -name prime256v1 -genkey -noout -out supabase-jwt-private-key.pem
```

View the generated file:

```bash
cat supabase-jwt-private-key.pem
```

This is your **`SUPABASE_JWT_PRIVATE_KEY`**.

---

### Step 2: Convert the Private Key to Supabase JWK Format

Supabase requires the public component of your key in **JWK (JSON Web Key)** format. Run the repository helper script [`scripts/utils/export-supabase-public-key.ts`](file:///scripts/utils/export-supabase-public-key.ts):

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

> [!NOTE]
> Copy the **entire JSON object**, including the opening `{` and closing `}` curly braces.

---

### Step 3: Import into Supabase Dashboard & Extract `SUPABASE_JWT_KEY_ID`

1. Open your project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. In the left navigation, click the **Project Settings** icon (gear icon at the bottom of the sidebar).
3. Under the Settings sub-menu, go to **API** (or **Authentication** → **JWT Settings** depending on your Supabase UI version).
4. Scroll down to the **JWT Signing Keys** section.
5. Click **Create standby key**.
6. Check the box for **"Import an existing private key"**.
7. Paste the JSON JWK snippet you copied from Step 2 into the text box.
8. Click **Create standby key**.
9. Once the standby key is listed in the table, click the action menu (`...`) or the **Rotate keys** button to promote it to the **Current / Active key**.
10. In that table, look at the **Key ID** column for that active key row (it will look like a UUID, e.g. `07a5a024-3d60-4f91-a3e3-39645975dac1`).
11. **Copy this Key ID** — this value is your **`SUPABASE_JWT_KEY_ID`**.

---

### Step 4: Configure Extracted Values Across Environments

Once you have both items:

#### 1. Google Cloud Secret Manager (Cloud Run Production & Staging)

Upload the new secret values to Secret Manager:

```bash
# Upload PEM private key
gcloud secrets versions add supabase-jwt-private-key --project="<PROJECT_ID>" --data-file=supabase-jwt-private-key.pem

# Upload Supabase URL
echo -n "https://<your-project-ref>.supabase.co" | gcloud secrets versions add supabase-url --project="<PROJECT_ID>" --data-file=-

# Upload Service Role Key
echo -n "<your-service-role-key>" | gcloud secrets versions add supabase-service-role-key --project="<PROJECT_ID>" --data-file=-

# Upload Database URL (Transaction pooler, port 6543)
echo -n "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres" | gcloud secrets versions add database-url --project="<PROJECT_ID>" --data-file=-
```

#### 2. Deployment Shell Scripts

Update `SUPABASE_JWT_KEY_ID` in deployment configs:

- For Development: [`scripts/deploy/common.dev.sh`](file:///scripts/deploy/common.dev.sh)
- For Production: [`scripts/deploy/common.prod.sh`](file:///scripts/deploy/common.prod.sh)

```bash
export SUPABASE_JWT_KEY_ID='<your-copied-key-id-uuid>'
```

#### 3. Local Development (`.env`)

In your local environment file, set:

```bash
SUPABASE_URL="https://<your-project-ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<your-service-role-key>"
SUPABASE_JWT_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----"
SUPABASE_JWT_KEY_ID="<your-copied-key-id-uuid>"
DIRECT_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
```

---

### Step 5: Don't Forget the Supabase Realtime SQL Migration!

Since this is a fresh Supabase project, execute the chat Realtime publication and RLS policies in the new project:

1. Open the new Supabase Dashboard → **SQL Editor**.
2. Run the contents of [`supabase/migrations/20260902000000_chat_realtime_rls.sql`](file:///supabase/migrations/20260902000000_chat_realtime_rls.sql):

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

---

## 🔍 Verification & Diagnostics

To verify your configuration:

1. **Test Token Generation**: Call `GET /api/v1/chats/supabase-token` with an authenticated user session.
2. **Inspect Token Header**: Paste the received token into [jwt.io](https://jwt.io).
   - Verify header algorithm is `ES256`.
   - Verify header `kid` matches `SUPABASE_JWT_KEY_ID`.
   - Verify payload `sub` matches the user's ID and `aud` is `'authenticated'`.
3. **Verify WebSocket Handshake**: Ensure client connects using `supabase.realtime.setAuth(token)`.

---

## 📚 Related Documentation

- [Supabase Realtime Architecture & Runbook](file:///docs/docs/architecture/supabase-realtime.md)
- [GCP Secret Rotation Runbook](file:///docs/docs/secret-rotation.md)
- [Troubleshooting Common Issues](file:///docs/docs/troubleshooting.md)
