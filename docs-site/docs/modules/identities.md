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

* **`PHONE`**: User mobile phone number. Requires OTP validation.
* **`EMAIL`**: User email address.
* **`INSTAGRAM`**: Instagram social identifier.
* **`LINKEDIN`**: LinkedIn profile link identifier.
* **`TWITTER`**: Twitter profile handle link identifier.
* **`OTHER`**: Generic fallback category for custom integrations.

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
