---
sidebar_position: 24
---

# Maintenance Module

The `MaintenanceModule` serves as the centralized orchestration facade for scheduled data-hygiene operations, credential lifecycle rotations, and gateway status reconciliations triggered by **Google Cloud Scheduler**.

:::tip Architecture Deep-Dive
For complete architectural details on privilege segregation, dual Cloud Run service deployment, and OIDC cryptographic verification, see the **[Maintenance & Internal Worker Architecture Guide](/architecture/maintenance-service)**.
:::

---

## 📋 Purpose & Responsibilities

- **Instagram Token Rotation**: Automatically rotates Instagram Long-Lived User Access Tokens monthly and stores the updated secret in GCP Secret Manager.
- **Credit Expiry Fan-Out**: Identifies and voids expired credit bundles via scalable cursor-paginated Pub/Sub fan-out jobs.
- **Credit Expiry Warnings**: Dispatches advance warning notifications to users whose credit bundles are nearing expiration.
- **Payment Reconciliation**: Reconciles stale `PENDING` payment orders against external gateways (Razorpay) to resolve missed webhooks.
- **Dormant Data Cleanup**: Bulk-voids stale interactions (like `PENDING` likes older than 90 days) to prevent dormant swipes from triggering matches unexpectedly.
- **User Session Retention Cleanup**: Prunes expired and revoked `UserSession` records older than 7 days in chunked non-blocking batches to prevent unbounded table growth.

---

## 🔐 Security & Access Control

All scheduled maintenance endpoints are housed under `/api/v1/internal/jobs/*` and enforce two strict security decorators:

1. **`@SkipClientIdentity()`**: Bypasses mobile app client identification headers (`x-client-id`, `x-api-key`, `x-timezone`) since requests originate from Cloud Scheduler rather than mobile apps.
2. **`@UseGuards(GcpOidcAuthGuard)`**: Validates Google-signed OpenID Connect (OIDC) Bearer tokens against Google's public JWKS certificates, verifying token issuer (`accounts.google.com`), expected audience (`maintenance-service` URI), and authorized GCP service account email.

---

## 🛠 Endpoints & Schedulers

| HTTP Endpoint                                       | Triggered By                        |      Schedule      | Backing Service Handler                          |
| :-------------------------------------------------- | :---------------------------------- | :----------------: | :----------------------------------------------- |
| `POST /api/v1/internal/jobs/rotate-instagram-token` | `rotate-instagram-token-job`        |  `0 0 1 * * UTC`   | `InstagramService.refreshSystemAccessToken()`    |
| `POST /api/v1/internal/jobs/expire-bundles`         | `expire-credit-bundles-job`         |  `0 0 * * * UTC`   | `MaintenanceService.expireCreditBundles()`       |
| `POST /api/v1/internal/jobs/warn-expiring-bundles`  | `warn-expiring-credit-bundles-job`  |  `0 10 * * * UTC`  | `MaintenanceService.warnExpiringCreditBundles()` |
| `POST /api/v1/internal/jobs/reconcile-payments`     | `reconcile-payments-job`            | `*/30 * * * * UTC` | `PaymentsService.reconcilePendingOrders()`       |
| `POST /api/v1/internal/jobs/purge-expired-sessions` | `purge-expired-user-sessions-job`   |  `0 3 * * 0 UTC`   | `MaintenanceService.purgeExpiredUserSessions()`  |
| `POST /api/v1/maintenance/void-pending-likes`       | Manual / Internal Admin             |     On-Demand      | `MaintenanceService.voidPendingLikes()`          |

---

## 🧠 Business Logic & Core Concepts

### 1. Monthly Secret Rotation (Instagram Token)

Instagram Long-Lived Access Tokens expire after 60 days and must be renewed before expiry. The `rotate-instagram-token` endpoint:

1. Dynamically reads the current token from **GCP Secret Manager** (`access-token-instagram`) via `GcpSecretManagerService`.
2. Calls the Instagram Graph API (`https://graph.instagram.com/refresh_access_token`) to obtain a refreshed 60-day token.
3. Automatically writes the newly generated token back to Secret Manager as a new version.
4. Updates runtime memory so in-flight processes immediately leverage the fresh credential.

### 2. Idempotent Fan-Out (Credit Expiry)

Rather than processing all users in a single synchronous loop (which would exhaust memory at scale), `expireCreditBundles` pins a single `asOf` timestamp and cursor-paginates over distinct users with expired credits. It pushes lightweight `userId` batches to Pub/Sub (`CREDIT_EXPIRY_BATCH`). This keeps the Cloud Scheduler HTTP request fast (< 5 seconds) and allows Cloud Run worker instances to scale out horizontally to do the actual voiding.

### 3. Rolling Daily Warning Window

The `warnExpiringCreditBundles` job targets credits expiring in exactly 6 to 7 days. Because it runs daily, every bundle falls into this exact 24-hour window exactly once. This clever time-windowing provides a single warning notification without needing to add a stateful `warnedAt` flag to the database schema.

### 4. Bulk Voiding

The `voidPendingLikes` method updates all `PENDING` likes older than 90 days to `VOIDED` in a single query (`updateMany`). This is highly optimized compared to fetching records into memory and updating them individually, while still retaining the voided likes for audit purposes.

### 5. Scheduled User Session Retention Cleanup

With 15-minute access token lifetimes, every active user generates approximately 4 `UserSession` records per active hour (~96 rows/day). Over months across active users, the `UserSession` table would grow by millions of records, degrading B-Tree index lookup speed on `jti` and `userId`.

The `purge-expired-sessions` job resolves this via a weekly automated cleanup routine:

1. **7-Day Audit Horizon**: Sessions are not deleted immediately upon expiry. A 7-day retention grace period (`expiresAt < NOW() - 7 days`) is retained to preserve forensic audit trails for security investigations, suspicious login audits, and client session debugging.
2. **Chunked Deletion Mechanics (5,000 Rows/Batch)**: Issuing a monolithic `DELETE` across hundreds of thousands of rows would cause PostgreSQL exclusive row locks, balloon write-ahead logs (WAL), and starve live login transactions. Instead, `MaintenanceService.purgeExpiredUserSessions` executes iterative deletions:
   ```typescript
   while (hasMore) {
     const expiredSessions = await this.prisma.userSession.findMany({
       where: { expiresAt: { lt: cutoffDate } },
       select: { id: true },
       take: 5000,
     });
     if (expiredSessions.length === 0) break;

     const ids = expiredSessions.map((s) => s.id);
     await this.prisma.userSession.deleteMany({
       where: { id: { in: ids } },
     });
     if (expiredSessions.length < 5000) hasMore = false;
   }
   ```
3. **HTTP 204 No Content Response Contract**: The endpoint returns `204 No Content` to conform with RESTful standards for execution endpoints that require no response body.

---

## 📁 File & Module Structure

- **[`MaintenanceController`](file:///src/modules/maintenance/maintenance.controller.ts)**: Exposes internal maintenance routes protected by `GcpOidcAuthGuard`.
- **[`MaintenanceService`](file:///src/modules/maintenance/maintenance.service.ts)**: Orchestrates data-hygiene jobs and Pub/Sub fan-out events.
- **[`MaintenanceModule`](file:///src/modules/maintenance/maintenance.module.ts)**: Imports domain feature modules (`InstagramModule`, `CreditsModule`, `PaymentsModule`) to delegate business logic.
