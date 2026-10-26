---
sidebar_position: 9
title: Users Module
description: User account operations, identity lifecycle, and GDPR Article 15/20 & CCPA § 1798.110 Data Subject Access Requests (DSAR).
---

# Users Module

The `UsersModule` manages authenticated user account operations and provides a fully asynchronous, cryptographically secure **Data Subject Access Request (DSAR) personal data export pipeline** in compliance with **GDPR Article 15 (Right of Access)**, **GDPR Article 20 (Right to Data Portability)**, and **CCPA § 1798.110**.

---

## 📋 Purpose & System Role

User privacy and data sovereignty are fundamental architectural tenets in BreathAway. The `UsersModule` ensures that users have immediate, self-service access to export all personal data stored across every datastore in the platform (Cloud SQL, Supabase Realtime, and Google BigQuery) in a standardized, machine-readable, and encrypted format.

Key responsibilities include:

- **Asynchronous Export Dispatch**: Accepting export requests and queueing them asynchronously via Google Cloud Pub/Sub, returning an immediate `202 Accepted` response with no client-side blocking.
- **Passphrase-Protected Encryption**: Encrypting personal data archives end-to-end using AES-256 (`archiver-zip-encrypted`) with a user-supplied or cryptographically generated passphrase.
- **Zero-Knowledge Architecture**: The decryption passphrase is never persisted in the database, audit logs, or storage metadata.
- **Dynamic V4 Signed URLs**: Generating short-lived (1-hour TTL) Google Cloud Storage V4 signed URLs on-demand for downloading completed archives.
- **Rate Limiting & Mutex**: Enforcing a 24-hour export cooldown window with an explicit `force` parameter to safely re-export if a passphrase was misplaced.

---

## 🛣 API Endpoints

All endpoints require JWT Bearer authentication (`JwtAuthGuard`) and operate within the `/api/v1/users` route prefix.

### 1. Request Data Export

```http
POST /api/v1/users/me/export
```

Initiates an asynchronous personal data extraction job. The API validates account state, checks the 24-hour rate limit, records a `PENDING` export record in PostgreSQL, queues a job on the `dsar-export` Pub/Sub topic, and immediately responds with `202 Accepted`.

#### Request Payload (`RequestDsarExportRequestDto`)

| Field        | Type      | Required | Default   | Description                                                                                                                                        |
| :----------- | :-------- | :------- | :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| `passphrase` | `string`  | Optional | Generated | Custom passphrase (8–64 chars) to encrypt the archive. If omitted, a high-entropy 16-character alphanumeric passphrase is automatically generated. |
| `force`      | `boolean` | Optional | `false`   | When set to `true`, bypasses the 24-hour cooldown window. Used when the user forgot or lost their previous passphrase.                             |

```json
{
  "passphrase": "MySecurePassword2026!",
  "force": false
}
```

#### Response (`202 Accepted` — `DsarExportResponseDto`)

```json
{
  "id": "01JB0Z9G4K3V8W2N7Q1M9P6R5T",
  "userId": "01JB0Z9G4K3V8W2N7Q1M9P6R5U",
  "status": "PENDING",
  "passphrase": "MySecurePassword2026!",
  "downloadUrl": null,
  "fileSizeBytes": null,
  "checksumSha256": null,
  "requestedAt": "2026-10-18T12:00:00.000Z",
  "completedAt": null,
  "expiresAt": null
}
```

> [!IMPORTANT]
> The `passphrase` is returned **only once** in the initial `202 Accepted` response. Clients must display this passphrase to the user immediately, prompting them to save it for archive decryption.

#### Error Responses

- **`401 Unauthorized`**: Missing or invalid JWT access token.
- **`404 Not Found`**: User account does not exist or has been soft-deleted.
- **`409 Conflict`**: An export job for this user is currently in `PENDING` or `PROCESSING` status.

---

### 2. Get Export Status & Download URL

```http
GET /api/v1/users/me/export
```

Fetches the status and metadata of the latest export request for the authenticated user.

- While processing: Returns `status: "PENDING"` or `status: "PROCESSING"`.
- When completed: Returns `status: "COMPLETED"`, file size, SHA-256 checksum, and a dynamically generated **1-hour Google Cloud Storage V4 signed download URL**.
- If failed: Returns `status: "FAILED"` with error diagnostics.

#### Response (`200 OK` — `DsarExportResponseDto`)

```json
{
  "id": "01JB0Z9G4K3V8W2N7Q1M9P6R5T",
  "userId": "01JB0Z9G4K3V8W2N7Q1M9P6R5U",
  "status": "COMPLETED",
  "passphrase": null,
  "downloadUrl": "https://storage.googleapis.com/breathaway-development-dsar-exports/exports/01JB.../01JB...zip?X-Goog-Algorithm=GOOG4-RSA-SHA256&...",
  "fileSizeBytes": 4194304,
  "checksumSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "requestedAt": "2026-10-18T12:00:00.000Z",
  "completedAt": "2026-10-18T12:00:08.521Z",
  "expiresAt": "2026-10-25T12:00:08.521Z"
}
```

#### Error Responses

- **`401 Unauthorized`**: Missing or invalid JWT token.
- **`404 Not Found`**: No export requests exist for this user account.

---

## 🔒 Security & Privacy Invariants

### 1. Zero-Knowledge Passphrase Architecture

The passphrase used to encrypt the ZIP archive is **never persisted** to the database or written to structured application logs. The plaintext passphrase exists in memory only during the initial `POST` handler, travels securely through GCP Pub/Sub as an encrypted message payload, and is passed directly into the streaming archiver before being discarded.

### 2. Multi-Store Envelope Decryption

Personal data stored with application-layer Field-Level Encryption (FLE)—such as `UserProfile.firstName` and `UserProfile.lastName`—is decrypted on the fly using **Google Cloud KMS** before being bundled into the archive, ensuring the exported JSON files contain readable personal data as mandated by GDPR Article 20.

### 3. Counterpart Privacy & Identity Redaction

Under GDPR Article 15(4), the right to obtain a copy of personal data must not adversely affect the rights and freedoms of others:

- Counterpart user identities in likes, matches, and blocks are redacted (`counterpart: "Counterpart User (identity redacted)"`).
- Chat message transcripts contain only the messages sent and received within conversations the requesting user was a participant in.

### 4. Cloud Storage Hardening & Automated Purge

- **Public Access Prevention**: The Cloud Storage bucket is configured with `public_access_prevention = "enforced"` in Terraform, eliminating public bucket risks.
- **Ephemeral Access**: Download URLs use Google Cloud Storage V4 signatures restricted to a 60-minute time-to-live.
- **7-Day Retention Lifecycle**: Archives are automatically purged after 7 days via GCS bucket lifecycle management rules.

---

## 📦 Export Archive Contents

The generated ZIP archive contains structured JSON files and a comprehensive human-readable `README.txt`:

| File                            | Description                                                                                       |
| :------------------------------ | :------------------------------------------------------------------------------------------------ |
| `manifest.json`                 | Export metadata, timestamp, expiration date, checksum, and legal basis.                           |
| `profile.json`                  | Account identifiers, decrypted first/last names, bio, date of birth, gender, and photos metadata. |
| `identities.json`               | Unmasked contact methods (phone numbers, emails) and social identities linked to the account.     |
| `devices.json`                  | Registered mobile and web device sessions, platforms, and app versions.                           |
| `subscriptions.json`            | Active and historical subscription plans, billing periods, pricing, and auto-renew states.        |
| `orders_and_transactions.json`  | Inbound payment orders and payment gateway transaction records.                                   |
| `credits_ledger.json`           | Complete double-entry ledger history of credit additions, usages, and expirations.                |
| `notifications.json`            | In-app notification history, categories, read receipts, and timestamps.                           |
| `consents_and_preferences.json` | Communication preferences, marketing consents, and IP/user-agent audit trail.                     |
| `interactions.json`             | Sent likes, mutual matches, and block records (counterpart PII redacted).                         |
| `chats/room_<id>.json`          | Decrypted message transcripts for every conversation room the user participated in.               |
| `audit_logs.json`               | Security, authentication, and compliance audit log trail from Google BigQuery.                    |
| `README.txt`                    | Extraction instructions, file descriptions, and privacy contact information.                      |

---

## 🔗 Related Architecture Guides

- **[DSAR Data Portability Pipeline Architecture](../architecture/dsar-portability.md)**: Sequence diagrams, streaming archiver mechanics, chunked datastore extraction, and Pub/Sub worker topology.
- **[Decoupled Domain Events](../architecture/domain-events.md)**: Documentation on `DSAR_EXPORT_COMPLETED_EVENT` and notification delivery.
- **[Notifications Module](./notifications.md)**: Handling of `DSAR_EXPORT_READY` multi-channel alerts (Brevo transactional email and FCM push).
