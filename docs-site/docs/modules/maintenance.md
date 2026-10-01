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

---

## 🔐 Security & Access Control

All scheduled maintenance endpoints are housed under `/api/v1/internal/jobs/*` and enforce two strict security decorators:

1. **`@SkipClientIdentity()`**: Bypasses mobile app client identification headers (`x-client-id`, `x-api-key`, `x-timezone`) since requests originate from Cloud Scheduler rather than mobile apps.
2. **`@UseGuards(GcpOidcAuthGuard)`**: Validates Google-signed OpenID Connect (OIDC) Bearer tokens against Google's public JWKS certificates, verifying token issuer (`accounts.google.com`), expected audience (`maintenance-service` URI), and authorized GCP service account email.

---

## 🛠 Endpoints & Schedulers

| HTTP Endpoint                                       | Triggered By                       |      Schedule      | Backing Service Handler                          |
| :-------------------------------------------------- | :--------------------------------- | :----------------: | :----------------------------------------------- |
| `POST /api/v1/internal/jobs/rotate-instagram-token` | `rotate-instagram-token-job`       |  `0 0 1 * * UTC`   | `InstagramService.refreshSystemAccessToken()`    |
| `POST /api/v1/internal/jobs/expire-bundles`         | `expire-credit-bundles-job`        |  `0 0 * * * UTC`   | `MaintenanceService.expireCreditBundles()`       |
| `POST /api/v1/internal/jobs/warn-expiring-bundles`  | `warn-expiring-credit-bundles-job` |  `0 10 * * * UTC`  | `MaintenanceService.warnExpiringCreditBundles()` |
| `POST /api/v1/internal/jobs/reconcile-payments`     | `reconcile-payments-job`           | `*/30 * * * * UTC` | `PaymentsService.reconcilePendingOrders()`       |
| `POST /api/v1/maintenance/void-pending-likes`       | Manual / Internal Admin            |     On-Demand      | `MaintenanceService.voidPendingLikes()`          |

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

---

## 📁 File & Module Structure

- **[`MaintenanceController`](file:///src/modules/maintenance/maintenance.controller.ts)**: Exposes internal maintenance routes protected by `GcpOidcAuthGuard`.
- **[`MaintenanceService`](file:///src/modules/maintenance/maintenance.service.ts)**: Orchestrates data-hygiene jobs and Pub/Sub fan-out events.
- **[`MaintenanceModule`](file:///src/modules/maintenance/maintenance.module.ts)**: Imports domain feature modules (`InstagramModule`, `CreditsModule`, `PaymentsModule`) to delegate business logic.
