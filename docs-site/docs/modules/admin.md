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

## 🛠 File & Class Definitions

### Controller
- **[AdminController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/admin/admin.controller.ts)**: Exposes endpoints for admin adjustments and suspensions.
  - Route Prefix: `/api/v1/admin`

### Service
- **[AdminService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/admin/admin.service.ts)**: Integrates administrative actions across other systems (e.g. database adjustments, and user state flag switches).
