---
sidebar_position: 11
title: DSAR Data Portability Pipeline Architecture
description: End-to-end architectural guide to asynchronous GDPR & CCPA personal data extraction, AES-256 streaming encryption, and decoupled notification delivery.
---

# 🛡 DSAR Data Portability Pipeline Architecture

The BreathAway backend provides an enterprise-grade, privacy-compliant **Data Subject Access Request (DSAR)** and **Data Portability Pipeline** designed in accordance with **GDPR Article 15 (Right of Access)**, **GDPR Article 20 (Right to Data Portability)**, and **CCPA § 1798.110**.

This document outlines the distributed architecture, streaming cryptography, multi-store data extraction mechanics, and event-driven notifications that power the system.

---

## 🎯 Architecture Overview & Legal Tenets

Under GDPR and CCPA, users have the statutory right to obtain a comprehensive, machine-readable copy of all personal data held by an organization. Meeting these requirements in a distributed cloud environment presents key challenges:

1. **Distributed Datastores**: User data is distributed across transactional databases (PostgreSQL / Cloud SQL), realtime messaging platforms (Supabase Realtime), and cold analytics/audit lakes (Google BigQuery).
2. **Encrypted at Rest**: Sensitive data (such as user names and contact identities) is stored using application-layer Field-Level Encryption (FLE) backed by Google Cloud KMS.
3. **Execution Latency**: Extracting records, paginating chat transcripts, resolving cryptographic keys, and packaging media can take several seconds to minutes for active accounts.
4. **Cloud Run Stateless Limits**: Holding HTTP connections open during long extraction tasks leads to gateway timeouts, socket pool starvation, and vulnerable memory consumption.
5. **Zero-Knowledge Security**: The user's decryption passphrase must protect the data in transit and at rest, but must never be retained by the platform.

### Architectural Solution

BreathAway addresses these challenges through a **fully asynchronous, streaming, decoupled event-driven pipeline**:

- **Non-blocking API**: Accepts the request and returns `202 Accepted` immediately with the encryption passphrase.
- **Queue-based Isolation**: GCP Pub/Sub decouples HTTP ingestion from heavy background processing.
- **Direct-to-Cloud Streaming**: Data is compressed and encrypted on-the-fly (`PassThrough` stream to Google Cloud Storage), eliminating disk I/O and large memory buffers.
- **Chunked Database Extractions**: Bounded database queries prevent connection pool exhaustion.
- **Decoupled Notification Delivery**: The worker emits domain events upon completion; `NotificationEventsListener` orchestrates push and email alerts directing the user to download the file in-app.

---

## 🔄 End-to-End Sequence Diagram

The following sequence diagram details the full lifecycle of an export request from client submission to notification and secure download:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client App (iOS / Web)
    participant API as UsersController & DsarExportService
    participant DB as Cloud SQL (PostgreSQL)
    participant PubSub as GCP Pub/Sub (Topic: dsar-export)
    participant Worker as DsarExportWorkerService
    participant KMS as Google Cloud KMS
    participant Supabase as Supabase / ChatsService
    participant BigQuery as Google BigQuery Audit
    participant GCS as GCP Cloud Storage (dsar-exports)
    participant EventBus as EventEmitter2
    participant Listener as NotificationEventsListener
    participant NotifSvc as NotificationsService (Brevo / FCM)

    %% Step 1: Request Export
    rect rgb(240, 248, 255)
    Note over Client, PubSub: Phase 1: Asynchronous Request Ingestion
    Client->>API: POST /api/v1/users/me/export { passphrase?, force? }
    API->>DB: Check active exports & 24h cooldown
    API->>DB: INSERT DsarExport (status: PENDING)
    API->>PubSub: publish(dsar-export, { exportId, userId, passphrase })
    API-->>Client: 202 Accepted { id, status: "PENDING", passphrase }
    end

    %% Step 2: Background Worker Processing
    rect rgb(245, 255, 245)
    Note over PubSub, GCS: Phase 2: Multi-Store Extraction & Streaming Encryption
    PubSub->>Worker: Push Job (@PubSubListener)
    Worker->>DB: Idempotency check: Verify PENDING, update to PROCESSING

    par Multi-Store Data Extraction (Chunked)
        Worker->>DB: Fetch Account, Profile, Identities, Devices (Chunk 1)
        Worker->>DB: Fetch Subscriptions, Orders, Ledger (Chunk 2)
        Worker->>DB: Fetch Notifications, Consents, Interactions (Chunk 3)
        Worker->>Supabase: exportChatHistory(userId) [Paginated 500-message chunks]
        Worker->>BigQuery: queryUserAuditLogs(userId)
    and Cryptographic Key Resolution
        Worker->>KMS: Decrypt FLE names & contact identities
    end

    Worker->>GCS: Open GCS Resumable Write Stream (exports/{userId}/{exportId}.zip)
    Note over Worker, GCS: Archiver pipes encrypted AES-256 stream directly to GCS.<br/>Zero local disk buffering; on-the-fly SHA-256 calculation.
    Worker->>GCS: Finalize ZIP stream & complete upload
    Worker->>DB: UPDATE DsarExport (status: COMPLETED, storagePath, checksum, size, expiresAt)
    end

    %% Step 3: Decoupled Notification
    rect rgb(255, 250, 240)
    Note over Worker, NotifSvc: Phase 3: Decoupled Domain Event & Notification
    Worker->>EventBus: emit(DSAR_EXPORT_COMPLETED_EVENT, { userId, exportId, expiresAt })
    EventBus->>Listener: handleDsarExportCompleted() (Async)
    Listener->>DB: Auto-resolve user first name
    Listener->>NotifSvc: dispatch(DSAR_EXPORT_READY, [EMAIL, PUSH])
    NotifSvc-->>Client: FCM Push: "Your data export is ready"
    NotifSvc-->>Client: Brevo Email: "Your personal data export is ready for download"
    end

    %% Step 4: Secure Download
    rect rgb(255, 245, 255)
    Note over Client, GCS: Phase 4: Authenticated Secure Download
    Client->>API: GET /api/v1/users/me/export
    API->>DB: Fetch latest export record
    API->>GCS: Generate 1-hour V4 Signed URL
    API-->>Client: 200 OK { status: "COMPLETED", downloadUrl, checksumSha256 }
    Client->>GCS: GET downloadUrl (Direct HTTPS download)
    Client->>Client: Extract archive locally using passphrase
    end
```

---

## 🗄 Multi-Store Data Extraction Architecture

BreathAway partitions personal data across multiple engines to optimize for performance, compliance, and real-time responsiveness. The `DsarExportWorkerService` coordinates queries across each store while enforcing query bounds to preserve connection headroom:

```mermaid
graph TD
    Worker[DsarExportWorkerService]

    subgraph "PostgreSQL / Cloud SQL (Relational Entities)"
        U[User & Auth Credentials]
        P[UserProfile & Photos]
        I[UserIdentities]
        D[Devices]
        S[Subscriptions & PaymentOrders]
        CL[CreditLedger & Transactions]
        N[Notifications & Preferences]
        L[Likes, Matches & Blocks]
    end

    subgraph "Supabase Realtime (Chat Store)"
        CR[Chat Rooms]
        CM[Paginated Messages (500/chunk)]
    end

    subgraph "Google BigQuery (Compliance Lake)"
        BQ[Security & Access Audit Logs]
    end

    subgraph "Google Cloud KMS"
        KMS[Decrypt FLE First/Last Names]
    end

    Worker --> U & P & I & D
    Worker --> S & CL & N & L
    Worker --> CR & CM
    Worker --> BQ
    Worker --> KMS
```

### 1. PostgreSQL (Cloud SQL) Extraction

To prevent connection pool starvation under Cloud Run autoscaling, database extractions are executed in **3 bounded parallel chunks** rather than a single monolithic transaction:

- **Chunk 1**: Account core, identities, auth credentials, and devices.
- **Chunk 2**: Subscriptions, payment orders, payment gateway transactions, and the double-entry credit ledger.
- **Chunk 3**: In-app notifications, privacy consents (`ConsentLedger`), communication preferences, sent likes, matches, and blocks.

### 2. Supabase Realtime (Paginated Chat Extraction)

Chat message history can span tens of thousands of messages. `ChatsService.exportChatHistory(userId)` executes paginated database fetches in **500-message chunks** (`take: 500`, `skip: cursor`), avoiding memory blowouts and statement timeouts.

### 3. Google BigQuery Audit Trail

All security events, authentication attempts, and data access records are archived in Google BigQuery. `BigQueryAuditService.queryUserAuditLogs(userId)` executes a parameterized query to extract the user's historical audit trail into `audit_logs.json`.

### 4. Cloud KMS Field-Level Decryption

Profile names (`firstName`, `lastName`) are stored in PostgreSQL using AES-256-GCM application-layer envelope encryption (`enc:v1:...`). During export, the worker uses `IdentityCryptoService` and Google Cloud KMS to decrypt the envelopes, ensuring the exported JSON files contain readable personal data as mandated by GDPR Article 20.

---

## 🔐 Streaming Compression & Cryptography

To support archives containing hundreds of megabytes of media and chat history without running out of memory on Cloud Run instances (which operate in memory-constrained environments), the export pipeline employs a **zero-disk, streaming architecture**:

```text
[ Data JSON / Media Streams ]
             │
             ▼
[ Archiver (archiver-zip-encrypted: AES-256) ]
             │ (Piped)
             ▼
[ PassThrough Stream (Chunk calculation & SHA-256 Hash) ]
             │ (Piped)
             ▼
[ GCS Resumable Write Stream (storageService.createWriteStream) ]
             │
             ▼
[ Google Cloud Storage (exports/{userId}/{exportId}.zip) ]
```

### Technical Highlights:

1. **PassThrough Stream Pipeline**: Archiver outputs directly to a Node.js `PassThrough` stream, which feeds `GcpStorageService.createWriteStream()`. The archive is uploaded in real time as data is formatted.
2. **On-the-fly SHA-256 Calculation**: As bytes pass through the stream, chunks are hashed incrementally (`hash.update(chunk)`), computing the cryptographic checksum without reading the file back from storage.
3. **AES-256 Encryption**: Files are encrypted inside the ZIP container using AES-256 (`archiver-zip-encrypted`). Clients can extract the archive using native OS utilities (macOS Archive Utility, Windows Explorer, iOS Files, Linux unzip) simply by supplying their passphrase.

---

## 📦 Archive Structure & Manifest

The generated ZIP archive organizes personal data into dedicated functional files:

```text
export-01JB0Z9G4K3V8W2N7Q1M9P6R5T.zip
├── manifest.json                  # Metadata, export ID, timestamp, legal basis
├── README.txt                     # Plaintext extraction guide & privacy contact
├── profile.json                   # Account info, decrypted names, bio, photos
├── identities.json                # Unmasked phone/email contacts & social links
├── devices.json                   # Registered devices, platforms, app versions
├── subscriptions.json             # Subscription tiers, periods, billing status
├── orders_and_transactions.json   # Payment orders & gateway transaction receipts
├── credits_ledger.json            # Double-entry ledger of credit additions/usages
├── notifications.json             # In-app notifications history & read receipts
├── consents_and_preferences.json  # Marketing consents & notification preferences
├── interactions.json              # Sent likes, matches & blocks (PII redacted)
├── audit_logs.json                # BigQuery compliance & authentication audit trail
└── chats/
    ├── room_01JB0Z...json         # Full transcript for conversation 1
    └── room_01JB1A...json         # Full transcript for conversation 2
```

---

## ⚙️ Operational Safeguards & Reliability

### 1. Non-Blocking HTTP 202 Accepted

Long-running jobs are never processed synchronously within the HTTP request lifecycle. The API creates a `DsarExport` record with status `PENDING` and immediately returns `202 Accepted`. Clients are not left waiting, and mobile connections can disconnect safely.

### 2. Rate Limiting, Cooldown & Force Override

- **24-Hour Cooldown**: Completed exports enforce a 24-hour rate limit mutex to prevent abuse of heavy multi-store extraction resources.
- **Lost Passphrase Recovery (`force: true`)**: Because BreathAway adheres to a zero-knowledge architecture and does not store the passphrase, users who lose their passphrase can submit `{ force: true }` to immediately invalidate the cooldown and trigger a fresh export.

### 3. Worker Idempotency & Concurrency Mutex

- When an export is requested, existing jobs in `PENDING` or `PROCESSING` state trigger an immediate `409 Conflict`.
- When the worker receives a message, it verifies the database record state. If already `COMPLETED`, the message is acknowledged and discarded, preventing duplicate processing during Pub/Sub message retries.

### 4. Automated 7-Day Lifecycle Purge

Exports represent sensitive point-in-time snapshots. To enforce data minimization:

- The database record records an `expiresAt` timestamp set to 7 days from completion.
- The Cloud Storage bucket is managed via Terraform with an automated lifecycle policy deleting objects older than 7 days:

```hcl
# terraform/storage.tf
resource "google_storage_bucket" "dsar_exports" {
  name                        = "${var.project_id}-dsar-exports"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 7
    }
  }
}
```

---

## 📡 Decoupled Domain Events

In accordance with BreathAway's event-driven architecture, the worker service never imports `NotificationsModule` or directly sends emails. Upon successful upload, it emits a domain event:

```typescript
this.eventEmitter.emit(
  DSAR_EXPORT_COMPLETED_EVENT,
  new DsarExportCompletedEvent(userId, exportId, expiresAt),
);
```

The centralized `NotificationEventsListener` receives the event asynchronously, resolves the user's recipient details, and dispatches multi-channel alerts (Brevo transactional email and FCM push notifications) instructing the user to download their export in-app.

---

## 🔗 Related Documentation

- **[Users Module Specification](../modules/users.md)**: Controller routes, request/response DTO schemas, and API usage examples.
- **[Decoupled Domain Events](../architecture/domain-events.md)**: Catalog of domain events and listener patterns.
- **[Notifications Module](../modules/notifications.md)**: Multi-channel delivery architecture (Brevo, FCM, WhatsApp).
- **[Database Architecture](../architecture/database.md)**: Connection pool management and query observability.
