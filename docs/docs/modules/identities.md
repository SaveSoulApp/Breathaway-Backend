---
sidebar_position: 10
---

# Identities Module

The `IdentitiesModule` handles the storage, lookups, and cryptographic protection of sensitive user identifiers.

---

## 📋 Purpose & Responsibilities

- **Envelope Encryption**: Performs local AES-256-GCM encryption on values, wrapping the encryption key with Google Cloud KMS.
- **Hashed Lookup**: Maintains deterministic SHA-256 hashes of sensitive columns (e.g. `publicValueHash`), allowing unique search operations in the database without decrypting columns.
- **Identity Types Management**: Supports multiple identity types and tracks verification states.

---

## ⚙️ Managed Enums

### IdentityType

Defines the channel categories for a user identity link:

- **`PHONE`**: User mobile phone number. Requires OTP validation.
- **`EMAIL`**: User email address.
- **`INSTAGRAM`**: Instagram social identifier.
- **`LINKEDIN`**: LinkedIn profile link identifier.
- **`TWITTER`**: Twitter profile handle link identifier.
- **`OTHER`**: Generic fallback category for custom integrations.

---

## 🗄 Cryptographic Schema Layout

The database records for `Identity` utilize the following secure columns:

```
Identity
├── id (ULID)
├── type (IdentityType enum)
├── publicValueHash (SHA-256 hash of the value, indexed)
├── publicValueCiphertext (AES-256-GCM encrypted data)
├── publicValueIv (Initialization vector, 24 chars)
├── publicValueTag (Auth tag, 24 chars)
├── publicValueWrappedKey (Key encrypted via GCP KMS)
├── publicValueKeyId (Reference to the KMS key version)
├── userId (String, Foreign Key mapping user)
├── isVerified (Boolean)
└── verifiedAt (DateTime, Optional)
```

### Encryption and Search Process

1. **Write Flow**:
   - The user inputs their phone number (`+123456789`).
   - The service calculates a SHA-256 hash: `hash("+123456789")` -> saved in `publicValueHash`.
   - The service requests an ephemeral AES key, encrypts the value using GCM mode, and wraps the AES key using GCP KMS -> saved in the respective cipher columns.
2. **Search Flow**:
   - To find if a phone number already exists, the service hashes the target input: `hash("+123456789")`.
   - Query: `SELECT * FROM Identity WHERE publicValueHash = 'target_hash'`.
   - If found, it fetches the record. If it needs the readable value, it decrypts it using the wrapped key and KMS.

### 🔐 Compact Field-Level Envelope Encryption

In addition to multi-column entity encryption for `Identity`, `IdentityCryptoService` provides serialized, single-column envelope encryption for sensitive annotations and metadata across the platform (such as `Like.label`):

- **`encryptText(text: string): Promise<string>`**:
  Generates an ephemeral AES-256 data key, wraps it via GCP Cloud KMS, encrypts the plaintext using AES-256-GCM, and formats the output into a single string:
  ```text
  enc:v1:<keyId>:<ivBase64>:<tagBase64>:<wrappedKeyBase64>:<ciphertextBase64>
  ```
- **`decryptText(value?: string | null): Promise<string | null>`**:
  Strictly validates the `enc:v1:` prefix, unwraps the ephemeral key using KMS, verifies the authentication tag, and decrypts the ciphertext. Rejects unencrypted data with a warning to ensure zero plaintext leakage.
- **`isEncryptedText(value?: string | null): boolean`**:
  Validates if a value conforms to the canonical `enc:v1:` encryption format.

---

## 🧠 Business Logic & Core Concepts

### 1. Atomic Identity Claiming

During OAuth or OTP flows, if an identity exists and is unowned (`userId = null`), `claimOrCreateIdentity` updates it to belong to the authenticated user rather than creating a duplicate row. This seamlessly resolves pre-existing "Ghost Identities" created by the Likes system.

### 2. Soft Deletion Hash Mangling

If the service discovers a duplicate, unverified identity during an update operation, it soft-deletes the duplicate but also mangles its hash (e.g., appending `-del-ID` to the `publicValueHash`). This guarantees that the soft-deleted row won't cause unique constraint collisions if the same value is inserted or queried in the future.

### 3. Asynchronous Match Triggers

After successfully claiming an identity, the service does not resolve matches synchronously. Instead, it acts as a fire-and-forget publisher, emitting `IDENTITY_CLAIMED` to Pub/Sub. This prevents heavy match-resolution logic from delaying the user's HTTP response.

### 4. Pending Handle State Management (Redis)

To ensure that the user claiming an Instagram handle is the exact person messaging from that handle on Instagram:

- **`setPendingInstagramHandle(userId, handle)`**: When the user enters their Instagram handle during onboarding, it is cached in Redis under `pending_ig_handle:<userId>` with a TTL aligned with the OTP expiration window.
- **`getPendingInstagramHandle(userId)`**: During webhook processing, `IdentityWorkflowsService` retrieves this value and compares it against the sender's actual Instagram handle returned by the Meta Graph API.
- **`clearPendingInstagramHandle(userId)`**: Automatically deleted upon successful identity verification or upon handle mismatch, guaranteeing stale intents do not persist.

### 5. Identity Deletion & Ghost Lifecycle (Why We Never Hard-Delete)

When an authenticated user deletes or unlinks an identity (`DELETE /api/v1/identities/:id`), the backend does **not** execute a physical database row deletion. Instead, [`IdentitiesService.delete()`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/identities/identities.service.ts) performs a soft-deletion and customer detachment:

```typescript
await this.prisma.identity.update({
  where: { id },
  data: {
    deletedAt: DateUtil.now(),
    userId: null,
    isVerified: false,
    verifiedAt: null,
  },
});
```

#### Why We Detach Rather Than Hard-Delete

1. **Pre-Registration & Ghost Identity Architecture**:
   In Breathaway, users can send likes toward phone numbers or Instagram handles _before_ the target recipient has registered. These exist as unowned "ghost identities" (`userId = null`). When a registered user unlinks an identity, that record simply transitions back to an unowned ghost identity awaiting potential future claim.
2. **Financial Ledger & Cascade Destruction Prevention**:
   The Prisma schema defines a cascading foreign key from `Like` to `Identity`:
   ```prisma
   targetIdentity Identity @relation(fields: [targetIdentityId], references: [id], onDelete: Cascade)
   ```
   If an `Identity` row were hard-deleted from PostgreSQL (`prisma.identity.delete`), the database engine would immediately cascade-delete every `Like` targeting that identity. This would permanently destroy:
   - Senders' paid credit spending histories and credit transaction ledgers.
   - Match records referencing counterpart likes (`likeOneId` and `likeTwoId`).
   - Abuse reporting and audit trail histories.
3. **Deterministic Hash Uniqueness (`@@unique([type, publicValueHash])`)**:
   PostgreSQL enforces composite unique constraints across the table without a `deletedAt` discriminator. If an identity were hard-deleted and later re-created, cryptographic tracking and continuous envelope integrity across past interactions would be disrupted. Preserving the row in a detached state allows seamless re-claiming.

#### What Data Is Preserved and Why

| Preserved Field                                                 | Rationale                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`publicValueHash`**                                           | Retains the deterministic SHA-256 index so incoming likes or contact scans can resolve to this identity row without exposing or needing owner status.                                                                                                                                                                                                                                                   |
| **`publicValueCiphertext`, `Iv`, `Tag`, `WrappedKey`, `KeyId`** | Preserves KMS-backed cryptographic envelope integrity without leaving orphaned ciphertext or dangling keys in Cloud KMS.                                                                                                                                                                                                                                                                                |
| **`platformId` & `platformIdHash`**                             | Handles can change, but platform IDs are immutable. On Instagram, a user might change their username from `@username_old` to `@username_new`. Meta's numeric platform ID (`platformId`) never changes. Keeping `platformIdHash` (guarded by `@@unique([type, platformIdHash])`) ensures that if the user reconnects under a new handle, the backend identifies it as the same physical social identity. |

#### Why Verification State Is Cleared (`isVerified: false`, `verifiedAt: null`)

When an identity's `userId` is set to `null`, **no user owns the identity**:

- Leaving `isVerified: true` would introduce stale and invalid state — an unowned ghost identity cannot be verified.
- When an unowned identity is later claimed by a new user (or re-claimed by the previous owner, e.g. after a carrier phone number re-assignment), the claimant **must** pass fresh OTP or OAuth verification before the identity can be used for active matching.

#### How to Reclaim Back

When a user adds or links an identity that already exists in the unowned ghost state:

1. **Detection**:
   During `create()` or `claimOrCreateIdentity()`, the service hashes the incoming handle and platform ID and searches `Identity` for a matching `type` and `publicValueHash` or `platformIdHash`.
2. **Ownership Check (`isActivelyOwned`)**:
   The service evaluates whether the existing identity is actively held:
   ```typescript
   private isActivelyOwned(identity: Identity): boolean {
     return identity.userId !== null && identity.isVerified;
   }
   ```

   - If owned by a different user with `isVerified: true`: throws `IdentityAlreadyExistsException` (or `IdentityAlreadyClaimedException`).
   - If detached (`userId: null`) or owned by the same user: permits claiming.
3. **Reclaim Execution**:
   The existing row is claimed and reactivated in-place:
   ```typescript
   await tx.identity.update({
     where: { id: existing.id },
     data: {
       userId: newUserId,
       deletedAt: null,
       isVerified: isOAuthVerified ? true : false,
       verifiedAt: isOAuthVerified ? DateUtil.now() : null,
       ...publicValueData,
       ...platformIdData,
     },
   });
   ```
4. **Activation & Match Resolution**:
   - Once reclaimed and verified, any historical or pending inbound likes pointing to this identity automatically link to the newly associated user.
   - The service publishes `IDENTITY_CLAIMED` to Pub/Sub to trigger asynchronous match resolution against pending likes.
