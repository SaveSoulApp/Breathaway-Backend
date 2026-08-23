---
sidebar_position: 24
---

# Maintenance Module

The `MaintenanceModule` implements scheduled data-hygiene operations (Cron jobs) that keep the database clean and consistent with business rules that cannot be enforced at write time.

---

## 📋 Purpose & Responsibilities

- **Credit Expiry**: Identifies and voids expired credit bundles via scalable fan-out jobs.
- **Credit Expiry Warnings**: Dispatches warning notifications to users whose credit bundles are nearing expiration.
- **Dormant Data Cleanup**: Bulk-voids stale interactions (like `PENDING` likes older than 90 days) to prevent long-dormant swipes from triggering matches unexpectedly.

---

## 🧠 Business Logic & Core Concepts

### 1. Idempotent Fan-Out (Credit Expiry)

Rather than processing all users in a single synchronous loop (which would exhaust memory at scale), `expireCreditBundles` pins a single `asOf` timestamp and cursor-paginates over distinct users with expired credits. It pushes lightweight `userId` batches to Pub/Sub (`CREDIT_EXPIRY_BATCH`). This keeps the Cloud Scheduler HTTP request fast and allows Cloud Run to scale out horizontally to do the actual voiding.

### 2. Rolling Daily Warning Window

The `warnExpiringCreditBundles` job targets credits expiring in exactly 6 to 7 days. Because it runs daily, every bundle falls into this exact 24-hour window exactly once. This clever time-windowing provides a single warning notification without needing to add a stateful `warnedAt` flag to the database schema.

### 3. Bulk Voiding

The `voidPendingLikes` method updates all `PENDING` likes older than 90 days to `VOIDED` in a single query (`updateMany`). This is highly optimized compared to fetching records into memory and updating them individually, while still retaining the voided likes for audit purposes.

---

## 🛠 File & Class Definitions

### Controller

- **[MaintenanceController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/maintenance/maintenance.controller.ts)**: Handles triggering the maintenance cron jobs.
  - Route Prefix: `/api/v1/maintenance`

### Service

- **[MaintenanceService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/maintenance/maintenance.service.ts)**: Orchestrates the idempotent fan-out jobs and bulk database updates.
