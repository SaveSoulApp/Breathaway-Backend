---
sidebar_position: 21
---

# Admin Module

The `AdminModule` handles internal administrative actions, including manual credit adjustments, user moderation, and metrics collection.

---

## 📋 Purpose & Responsibilities

- **Manual Credit Adjustment**: Allows administrators to award or revoke credits to a user profile (logged in `CreditLedger` under source `ADMIN`).
- **User Moderation**: Facilitates user account suspensions or profile audits following user reports.
- **Access Protection**: Secured strictly behind role-based access controllers (RBAC), verifying administrative signatures or specific authorization policies.

---

## 🧠 Business Logic & Core Concepts

### 1. Cascading Soft Deletion

When an admin invokes `deleteAccount`, it doesn't just delete the user record. It executes a robust Prisma `$transaction` that cascadingly soft-deletes the `User`, their `Identity` records, and their `AuthCredential` records. This ensures no orphaned identities remain actionable while preserving the data for audit trails.

### 2. Immediate Device Deactivation

During the account deletion transaction, the service forcefully updates all of the user's active devices to `isActive: false`. This guarantees that push notifications immediately cease routing to the banned user's devices without waiting for a token refresh cycle.

---

## 🛠 File & Class Definitions

### Controller

- **[AdminController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/admin/admin.controller.ts)**: Exposes endpoints for admin adjustments and suspensions.
  - Route Prefix: `/api/v1/admin`

### Service

- **[AdminService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/admin/admin.service.ts)**: Integrates administrative actions across other systems (e.g. database adjustments, and user state flag switches).
