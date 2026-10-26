---
sidebar_position: 6
---

# GCP Secret Rotation & Lifecycle Runbook

This runbook establishes the definitive protocol for creating, rotating, deploying, monitoring, and deprecating secrets in Google Cloud Secret Manager for the BreathAway NestJS backend across both `dev` and `prod` environments.

---

## ⚡ TL;DR (Quick Reference)

Rotating a secret without dropping user connections or triggering container boot failures follows a strict **5-Stage Zero-Downtime Rule**:

```
[1. Publish New Version] ──▶ [2. Deploy Cloud Run Revision] ──▶ [3. Monitor Metrics & Logs] ──▶ [4. Soak (24-48h)] ──▶ [5. Disable & Destroy Old Version]
```

> **The Golden Rule:** **NEVER disable or delete an old secret version before deploying and verifying the new Cloud Run revision.**  
> Existing container instances rely on the currently active version. Disabling it prematurely causes container crash loops (`SECRETS_ACCESS_CHECK_FAILED`).

```bash
# 1. Add new version to GCP Secret Manager
echo -n "new-secret-value-here" | gcloud secrets versions add database-url --project=breathaway-prod --data-file=-

# 2. Deploy Cloud Run (deploy.sh auto-resolves and pins the new version number to the revision)
./scripts/deploy/deploy.sh --env=prod

# 3. Verify health and Cloud Run logs
curl -f https://api.breathaway.app/health/ready
gcloud logging read 'resource.type="cloud_run_revision" severity>=ERROR' --project=breathaway-prod --limit=20

# 4. After 24-48h soak period, disable and destroy the old version (e.g., version 2)
gcloud secrets versions disable 2 --secret=database-url --project=breathaway-prod
gcloud secrets versions destroy 2 --secret=database-url --project=breathaway-prod
```

---

## 📋 Short Summary

Cloud Run containers run in a stateless, autoscaled environment. Secrets are mounted as environment variables (`--update-secrets`) during instance cold-starts.

To prevent **autoscaling split-brain** and credential drift:

1. **Dynamic Deploy-Time Version Pinning (`INFRA-03`)**: [`scripts/deploy/deploy.sh`](file:///scripts/deploy/deploy.sh) concurrently queries Secret Manager for the latest active version in the target GCP project and attaches concrete version numbers (e.g. `DATABASE_URL=database-url:4`) to the new Cloud Run revision.
2. **Environment Independence**: `dev` and `prod` maintain their own independent version sequences while sharing the exact same codebase and deployment tooling.
3. **Graceful Instance Replacement**: Deploying a new revision triggers Cloud Run to boot fresh instances with the new secret, execute readiness probes (`/health/ready`), shift 100% of user traffic, and issue `SIGTERM` to safely drain and terminate all instances running the previous revision.

---

## 🏗 Architecture & Cross-Layer Synchronization

Every secret managed in Google Cloud Secret Manager requires coordinated synchronization across three architectural layers whenever a secret is **added**, **renamed**, or **deprecated/removed**:

```mermaid
flowchart TD
    subgraph SecretManager ["GCP Secret Manager (Cloud Storage of Secrets)"]
        SM_DEV["breathaway-development<br/>(e.g. database-url:15)"]
        SM_PROD["breathaway-prod<br/>(e.g. database-url:3)"]
    end

    subgraph Layer1 ["Layer 1: TypeScript Enum (src/common/enums/)"]
        ENUM["GcpSecretName.DATABASE_URL = 'database-url'"]
    end

    subgraph Layer2 ["Layer 2: Terraform IaC (terraform/)"]
        TF_NAMES["terraform/secrets.tf<br/>local.secret_names = { ... }"]
        TF_IAM["terraform/backend-iam.tf<br/>roles/secretmanager.secretAccessor"]
    end

    subgraph Layer3 ["Layer 3: Deployment Layer (scripts/deploy/)"]
        SH_CONF["scripts/deploy/common.secrets.sh<br/>COMMON_SECRETS=('DATABASE_URL=${SECRET_DATABASE_URL}:latest')"]
        SH_DEPLOY["scripts/deploy/deploy.sh<br/>resolve_secret_versions() in parallel"]
    end

    subgraph CloudRun ["GCP Cloud Run (Stateless Runtime)"]
        REV_OLD["Old Revision (Pinned: :2)<br/>Draining & Terminating Old Instances"]
        REV_NEW["New Revision (Pinned: :3)<br/>Fresh Instances Running New Secret"]
    end

    Layer1 -.->|"Type Safety"| Layer3
    Layer2 -.->|"Least Privilege IAM"| SecretManager
    SecretManager -->|"Dynamic Query"| SH_DEPLOY
    SH_DEPLOY -->|"Deploy New Revision"| REV_NEW
    REV_NEW -->|"Traffic Migration"| REV_OLD
```

### The 3 Code Layers:

1. **TypeScript Layer (`src/common/enums/gcp-secret-name.enum.ts`)**:
   - Holds canonical secret name strings in the `GcpSecretName` enum.
   - Accessed at runtime type-safely via NestJS `ConfigService` or `GcpSecretManagerService`.
2. **Terraform Infrastructure Layer (`terraform/secrets.tf` & `terraform/backend-iam.tf`)**:
   - Declares the secret in `local.secret_names`.
   - Binds `roles/secretmanager.secretAccessor` to `backend-service` runtime service account (least privilege).
3. **Deployment Layer (`scripts/deploy/common.secrets.sh` & `scripts/deploy/deploy.sh`)**:
   - `common.secrets.sh` exports canonical identifiers and maps them into `COMMON_SECRETS=(...)`.
   - `deploy.sh` resolves the latest active version per environment at deploy time, mounts pinned versions, and triggers a rolling Cloud Run revision update.

---

## 🔄 Detailed Runbook: How to Rotate Secrets in GCP

### Phase 1: Pre-Rotation Verification & Preparation

Before touching Secret Manager, determine the secret category and its transition strategy:

| Secret Category             | Examples                                                | Transition Strategy                                                    | Dual-Key Window Required?                        |
| :-------------------------- | :------------------------------------------------------ | :--------------------------------------------------------------------- | :----------------------------------------------- |
| **Third-Party API Keys**    | `BREVO_API_KEY`, `IPINFO_TOKEN`, `LITEAPP_WHATSAPP_KEY` | Generate new key in provider dashboard alongside existing key          | No (provider supports multiple keys)             |
| **Webhook HMAC Secrets**    | `RAZORPAY_WEBHOOK_SECRET`, `META_APP_SECRET`            | Add new secret version, then update webhook signing secret in provider | Yes (or instant transition)                      |
| **Database Credentials**    | `DATABASE_URL` (PostgreSQL / Cloud SQL)                 | Create secondary DB user or update password during maintenance         | Recommended (dual DB users)                      |
| **Authentication & Tokens** | `JWT_SECRET`, `SUPABASE_JWT_PRIVATE_KEY`                | Deploy new key; consider session rollover                              | Yes (if instant logout is unacceptable)          |
| **Symmetric Master Keys**   | `GCP_SECRET_MASTER_KEYS`, `GCP_SECRET_CHAT_MASTER_KEYS` | Add new key to JSON ring; update active ID pointer                     | Yes (key ring retains older keys for decryption) |

#### Pre-Flight IAM Check:

Verify that your operator or CI/CD account possesses `roles/secretmanager.admin` or `roles/secretmanager.secretVersionAdder` in the target GCP project:

```bash
gcloud projects get-iam-policy ${PROJECT_ID} \
  --flatten="bindings[].members" \
  --format="table(bindings.role)" \
  --filter="bindings.members:$(gcloud config get-value account)"
```

---

### Phase 2: Publish New Secret Version

Upload the new secret payload to Google Cloud Secret Manager.

:::warning Never Pass Secrets as CLI Arguments
Avoid `gcloud secrets versions add --data="secret"` as this leaks sensitive values into shell history (`~/.bash_history`, `~/.zsh_history`) and process tables (`ps aux`). Always use stdin or file pipes.
:::

#### Option A: Pipe via Stdin (Recommended for Interactive CLI)

```bash
# Read interactively without terminal echo:
read -s -p "Enter new secret value: " NEW_SECRET_VALUE
echo ""

# Pipe into Secret Manager:
echo -n "${NEW_SECRET_VALUE}" | gcloud secrets versions add <SECRET_NAME> \
  --project="${PROJECT_ID}" \
  --data-file=-

unset NEW_SECRET_VALUE
```

#### Option B: Read from Temporary Secure File

```bash
# Create temporary file with restricted permissions (0600)
SECRET_FILE=$(mktemp)
chmod 0600 "${SECRET_FILE}"

# Write payload (e.g. JSON or multiline private key)
cat << 'EOF' > "${SECRET_FILE}"
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3...
-----END PRIVATE KEY-----
EOF

# Upload to Secret Manager
gcloud secrets versions add <SECRET_NAME> \
  --project="${PROJECT_ID}" \
  --data-file="${SECRET_FILE}"

# Securely wipe and remove temporary file
shred -u "${SECRET_FILE}" 2>/dev/null || rm -f "${SECRET_FILE}"
```

#### Verify New Version State

```bash
gcloud secrets versions list <SECRET_NAME> \
  --project="${PROJECT_ID}" \
  --format="table(name,state,createTime)"
```

Confirm that the newly created version has `state: ENABLED`.

---

### Phase 3: Application Code & Terraform Synchronization

> **Note:** If you are only rotating the value of an existing secret (e.g., updating the password in `database-url`), **no code changes or Terraform commits are required.** Proceed straight to Phase 4.

If you are **adding a new secret** or **renaming an existing secret**, follow the 3-layer synchronization:

1. **TypeScript (`src/common/enums/gcp-secret-name.enum.ts`)**:
   ```typescript
   export enum GcpSecretName {
     // ...
     NEW_SECRET = 'new-secret-name',
   }
   ```
2. **Terraform (`terraform/secrets.tf`)**:
   ```terraform
   locals {
     secret_names = {
       # ...
       new_secret = "new-secret-name"
     }
   }
   ```
   Apply Terraform: `terraform plan` and `terraform apply`.
3. **Deployment Layer (`scripts/deploy/common.secrets.sh`)**:
   ```bash
   export SECRET_NEW_SECRET="new-secret-name"
   COMMON_SECRETS+=(
       "NEW_SECRET=${SECRET_NEW_SECRET}:latest"
   )
   ```

---

### Phase 4: Deploy & Trigger Cloud Run Rolling Update

Execute the deployment script for the target environment. The script automatically executes `resolve_secret_versions()` in parallel, fetching the latest enabled version for all secrets:

```bash
# For Development / Staging:
./scripts/deploy/deploy.sh --env=dev

# For Production:
./scripts/deploy/deploy.sh --env=prod
```

#### What Happens Under the Hood:

1. `deploy.sh` queries GCP Secret Manager and resolves concrete version numbers:
   ```
   🔨 Resolving active secret versions for environment [prod] (Project: breathaway-prod)...
   ✅ Secret versions resolved: 28 pinned to concrete versions, 0 unpinned (:latest)
   ```
2. It executes `gcloud run deploy` with explicit pinned mounts:
   ```bash
   --update-secrets="DATABASE_URL=database-url:4,JWT_SECRET=jwt-secret:3,..."
   ```
3. Cloud Run spins up fresh container instances for the new revision.
4. Cloud Run executes the container startup check and hits `GET /health/ready`.
5. Once healthy, Cloud Run migrates 100% of user traffic to the new revision.
6. Cloud Run sends `SIGTERM` to the old revision container instances, drains in-flight requests, and destroys them.

---

### Phase 5: Post-Deployment Monitoring & Health Verification

Monitor the rollout to ensure the new secret version is functioning as expected:

#### 1. Probe Application Health Endpoints

```bash
# Verify basic liveness
curl -fsS "https://api.breathaway.app/health" | jq .

# Verify readiness (validates DB pool, Redis, and KMS connectivity)
curl -fsS "https://api.breathaway.app/health/ready" | jq .
```

#### 2. Monitor Cloud Run Live Traffic & Revision Status

```bash
gcloud run services describe backend-service \
  --region=asia-south1 \
  --project="${PROJECT_ID}" \
  --format="table(status.conditions,status.traffic)"
```

Confirm that 100% of traffic is routed to the new revision.

#### 3. Inspect Structured Cloud Logging for Secret Errors

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND (severity>=WARNING OR textPayload=~"secret" OR jsonPayload.message=~"secret")' \
  --project="${PROJECT_ID}" \
  --limit=50 \
  --format="table(timestamp,severity,jsonPayload.message,textPayload)"
```

Verify that there are zero `SECRETS_ACCESS_CHECK_FAILED`, `PrismaClientInitializationError`, or `UnauthorizedException` errors.

---

### Phase 6: Deprecate & Destroy Old Secret Versions

:::danger Do Not Destroy Immediately
Always maintain a **24 to 48 hour soaking window** in production before disabling or destroying old versions. This guarantees that:

- Any long-running worker tasks, background jobs, or delayed webhook retries finish cleanly.
- Instant rollback remains available if an unexpected edge case arises.
  :::

#### Step 1: Disable the Old Version (After 24–48h)

Disabling prevents any new container instance from fetching the old secret, but allows you to re-enable it instantly if needed:

```bash
gcloud secrets versions disable <OLD_VERSION_NUMBER> \
  --secret=<SECRET_NAME> \
  --project="${PROJECT_ID}"
```

#### Step 2: Destroy the Old Version (After 7 Days)

Once verified that no traffic or dependencies remain, permanently destroy the old secret version:

```bash
gcloud secrets versions destroy <OLD_VERSION_NUMBER> \
  --secret=<SECRET_NAME> \
  --project="${PROJECT_ID}"
```

Confirm deletion:

```bash
gcloud secrets versions list <SECRET_NAME> \
  --project="${PROJECT_ID}"
```

---

## 🍳 Specialized Secret Rotation Recipes

### Recipe 1: Cloud SQL / PostgreSQL Database Password (`DATABASE_URL`)

To avoid dropped database transactions during rotation, use the **Dual-User Database Pattern**:

1. **Create a Secondary Database User**:
   ```sql
   CREATE USER breathaway_app_v2 WITH PASSWORD 'new-secure-password';
   GRANT ALL PRIVILEGES ON DATABASE breathaway TO breathaway_app_v2;
   GRANT ALL ON ALL TABLES IN SCHEMA public TO breathaway_app_v2;
   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO breathaway_app_v2;
   ```
2. **Add New Version to `database-url`**:
   ```bash
   echo -n "postgresql://breathaway_app_v2:new-secure-password@127.0.0.1:5432/breathaway?sslmode=disable" | \
     gcloud secrets versions add database-url --project="${PROJECT_ID}" --data-file=-
   ```
3. **Deploy Cloud Run Revision**:
   ```bash
   ./scripts/deploy/deploy.sh --env=prod
   ```
4. **Soak & Verify**: New instances connect as `breathaway_app_v2`. Old instances continue finishing requests as `breathaway_app_v1` until drained.
5. **Drop Old User**: Once all traffic is on the new revision and old instances are terminated, safely drop the old user:
   ```sql
   DROP USER breathaway_app_v1;
   ```

---

### Recipe 2: Master Symmetric Encryption Keys (`GCP_SECRET_MASTER_KEYS` & `ACTIVE_MASTER_KEY_ID`)

BreathAway uses envelope encryption with an active key ring stored in Secret Manager:

1. **Generate New 256-bit Key**:
   ```bash
   openssl rand -base64 32
   # Output: e.g. "K7x9Zb...=="
   ```
2. **Fetch Current Master Keys JSON**:
   ```bash
   gcloud secrets versions access latest --secret=gcp-secret-master-keys --project="${PROJECT_ID}" > master_keys.json
   ```
3. **Append New Key Version**:
   Edit `master_keys.json` to include the new key identifier:
   ```json
   {
     "key-2026-01": "old-base64-key...",
     "key-2026-10": "K7x9Zb...=="
   }
   ```
4. **Publish New Secret Versions**:
   - Add new version of `gcp-secret-master-keys` with the updated JSON.
   - Add new version of `active-master-key-id` containing `key-2026-10`.
5. **Deploy**:

   ```bash
   ./scripts/deploy/deploy.sh --env=prod
   ```

   - New encryption writes use `key-2026-10`.
   - Existing ciphertext encrypted under `key-2026-01` continues to decrypt seamlessly because `key-2026-01` remains in the key ring.

---

### Recipe 2B: Chat Master Encryption Keys (`GCP_SECRET_CHAT_MASTER_KEYS` & `ACTIVE_CHAT_MASTER_KEY_ID`)

Chat message encryption uses room-level DEKs wrapped by a dedicated chat master key in Secret Manager (remediating audit finding `DB-01`):

1. **Generate New 256-bit AES Master Key**:

   ```bash
   openssl rand -base64 32
   # Or using Node.js:
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   # Output: e.g. "xK9mP2vL8wQ4yR7tU1sO5nA3cE6gH8jK0mP4rT6vX8w="
   ```

2. **Fetch Current Chat Master Keys JSON**:

   ```bash
   gcloud secrets versions access latest --secret=gcp-secret-chat-master-keys --project="${PROJECT_ID}" > chat_keys.json
   ```

3. **Append New Key Version (e.g. `chat-v2`)**:
   Edit `chat_keys.json` to keep existing keys for historical rooms while introducing the new key:

   ```json
   {
     "chat-v1": "previous-base64-key...",
     "chat-v2": "xK9mP2vL8wQ4yR7tU1sO5nA3cE6gH8jK0mP4rT6vX8w="
   }
   ```

4. **Publish New Secret Versions**:
   - Add new version of `gcp-secret-chat-master-keys` containing the updated JSON.
   - Add new version of `active-chat-master-key-id` containing `chat-v2`.

5. **Deploy**:

   ```bash
   ./scripts/deploy/deploy.sh --env=prod
   ```

   - All newly created rooms will have their DEKs wrapped using `chat-v2` (`roomKeyId: "chat-v2"`).
   - Existing rooms wrapped with `chat-v1` will continue to unwrap and decrypt seamlessly because `chat-v1` remains in the key map.

---

### Recipe 3: Webhook Signing Secrets (`RAZORPAY_WEBHOOK_SECRET`, `META_APP_SECRET`)

When third-party providers (Razorpay, Meta) rotate their webhook HMAC signing keys:

1. **Add New Version in Secret Manager**: Upload the new provider secret to Secret Manager.
2. **Deploy Cloud Run**: Run `./scripts/deploy/deploy.sh --env=prod`. The new container instances boot with the new secret.
3. **Update Provider Dashboard**: In Meta or Razorpay developer portal, update the Webhook signing secret.
4. **Monitor Ingestion**: Inspect `POST /api/v1/webhooks/meta` or `POST /api/v1/webhooks/razorpay` logs to confirm signatures pass verification.

---

### Recipe 4: Client Identity Keys (`API_KEYS` & `CLIENT_IDS`)

Ingress keys for `x-api-key` and `x-client-id` are stored strictly as platform-keyed JSON objects (`android`, `ios`, `web`, `postman`) to enforce cross-platform isolation:

#### 1. Fetch Current Secret JSON

```bash
gcloud secrets versions access latest --secret=api-keys --project="${PROJECT_ID}" > api_keys.json
gcloud secrets versions access latest --secret=client-ids --project="${PROJECT_ID}" > client_ids.json
```

#### 2. Append New Key to Platform Array (Zero-Downtime Rollout)

To rotate a platform's key without breaking in-flight clients or older mobile app installs, **append** the new UUID alongside the old one:

```json
{
  "android": ["b9642b9e-f42b-40eb-815c-23a00801f353"],
  "ios": [
    "1a88387a-2acb-4bd9-9dee-731b1376de7d",
    "c5d6e7f8-0123-4567-89ab-cdef01234567"
  ],
  "web": ["d12e7628-4668-4d8a-9d03-564df85d1264"],
  "postman": ["e5f6a7b8-c9d0-4123-d3ef-123456789012"]
}
```

> [!WARNING] Cross-Platform Key Uniqueness
> Never reuse the same UUID across multiple platform arrays. `ClientIdentityGuard` enforces unique platform bindings. If a duplicate is detected, it logs a warning in Cloud Logging and retains binding exclusively to the first platform encountered.

#### 3. Upload New Versions to Secret Manager

```bash
gcloud secrets versions add api-keys --project="${PROJECT_ID}" --data-file=api_keys.json
gcloud secrets versions add client-ids --project="${PROJECT_ID}" --data-file=client_ids.json
```

#### 4. Deploy Cloud Run Revision

```bash
./scripts/deploy/deploy.sh --env=prod
```

#### 5. Deprecate Old Key (Post-Adoption)

Once the client app update is adopted by users, remove the deprecated key from the platform array, publish a final secret version, and re-deploy.

---

### Recipe 5: Supabase JWT Signing Key & Project Credentials (`SUPABASE_JWT_PRIVATE_KEY`, `SUPABASE_JWT_KEY_ID`)

When migrating to a new Supabase project or rotating the asymmetric `ES256` JWT signing keys:

> [!IMPORTANT]
> **Supabase does not generate or provide the private key.**  
> The backend holds the **Private Key** (PEM in Secret Manager), while the Supabase Dashboard holds the **Public Key** (JWK). The **Key ID (`SUPABASE_JWT_KEY_ID`)** is assigned by Supabase _after_ you import the JWK into the Dashboard.

#### Step 1: Generate or Fetch the Private Key

```bash
# Option A: Generate a fresh EC P-256 key
openssl ecparam -name prime256v1 -genkey -noout -out supabase-jwt-private-key.pem

# Option B: Or fetch the existing key from Secret Manager
gcloud secrets versions access latest --secret=supabase-jwt-private-key --project="${PROJECT_ID}" > supabase-jwt-private-key.pem
```

#### Step 2: Convert to JWK Format

```bash
SUPABASE_JWT_PRIVATE_KEY="$(cat supabase-jwt-private-key.pem)" npx ts-node scripts/utils/export-supabase-public-key.ts
```

Copy the exported JWK JSON object.

#### Step 3: Import into Supabase Dashboard

1. Go to **Supabase Dashboard → Project Settings → API → JWT Signing Keys**.
2. Click **Create standby key** → check **Import an existing private key**.
3. Paste the JWK JSON and click **Create standby key**.
4. In the keys table, click **Rotate keys** to promote this key to the active ("Current") key.
5. Copy the assigned **Key ID** (`kid` UUID).

#### Step 4: Update Secret Manager & Deployment Scripts

1. Upload the PEM private key to Secret Manager:
   ```bash
   gcloud secrets versions add supabase-jwt-private-key --project="${PROJECT_ID}" --data-file=supabase-jwt-private-key.pem
   ```
2. Update the Key ID in deployment configuration:
   In `scripts/deploy/common.<env>.sh`:
   ```bash
   export SUPABASE_JWT_KEY_ID='<copied-key-id-uuid>'
   ```
3. Deploy the backend:
   ```bash
   ./scripts/deploy/deploy.sh --env=prod
   ```

_For complete end-to-end details, consult [Supabase Realtime Architecture & Runbook](file:///docs/docs/architecture/supabase-realtime.md)._

---

## 🚨 Emergency Rollback Runbook

If a newly deployed secret version causes container crashes, database disconnects, or authentication failures:

### 1. Instant Traffic Rollback (Zero Rebuild Required)

Because Cloud Run revisions are immutable and pin exact secret version numbers, you can instantly rollback traffic to the previous known-good revision in **under 3 seconds**:

```bash
# List revisions to find the previous stable revision name:
gcloud run revisions list --service=backend-service --region=asia-south1 --project="${PROJECT_ID}" --limit=5

# Shift 100% traffic back to the previous stable revision:
gcloud run services update-traffic backend-service \
  --region=asia-south1 \
  --project="${PROJECT_ID}" \
  --to-revisions=<PREVIOUS_STABLE_REVISION_NAME>=100
```

### 2. Re-enable a Disabled Secret Version

If an old version was prematurely disabled and needs to be restored:

```bash
gcloud secrets versions enable <VERSION_NUMBER> \
  --secret=<SECRET_NAME> \
  --project="${PROJECT_ID}"
```

---

## ✅ Secret Rotation Operational Checklist

Use this checklist during every secret rotation procedure:

### Pre-Flight

- [ ] Determine secret category and verify whether a dual-credential window is required.
- [ ] Verify GCP IAM permissions (`secretVersionAdder` in target project).
- [ ] Ensure terminal is configured for the correct environment (`gcloud config set project <PROJECT_ID>`).

### Execution

- [ ] Add new version to Secret Manager via stdin or secure file (avoid shell history leakage).
- [ ] Verify version state is `ENABLED` (`gcloud secrets versions list`).
- [ ] **DO NOT disable or destroy existing versions.**
- [ ] Execute `./scripts/deploy/deploy.sh --env=<dev|prod>`.
- [ ] Confirm in deploy output that all secrets were resolved and pinned to concrete version numbers.

### Verification & Monitoring

- [ ] Verify `GET /health` returns `200 OK`.
- [ ] Verify `GET /health/ready` returns `200 OK` (database & Redis pools connected).
- [ ] Check Cloud Run console to confirm 100% traffic shifted to new revision.
- [ ] Inspect Cloud Logging for 0 errors related to secrets or initialization.
- [ ] Perform a business-critical smoke test (e.g. login, payment checkout, like resolution).

### Deprecation & Cleanup

- [ ] Allow 24–48 hour soaking window in production.
- [ ] Disable old version (`gcloud secrets versions disable <OLD_VERSION>`).
- [ ] After 7 days with zero rollbacks, destroy old version (`gcloud secrets versions destroy <OLD_VERSION>`).
