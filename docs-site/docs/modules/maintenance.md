---
sidebar_position: 24
---

# Maintenance Module

The `MaintenanceModule` provides controls to toggle "maintenance mode" across the platform.

---

## 📋 Purpose & Responsibilities

- **System Locking**: Disables write actions or blocks access to specific controller paths when undergoing updates.
- **Status Queries**: Serves maintenance details (messages, scheduled uptimes) to clients.

---

## 🛠 File & Class Definitions

### Controller
- **[MaintenanceController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/maintenance/maintenance.controller.ts)**: Handles admin updates and status reads.
  - Route Prefix: `/api/v1/maintenance`

### Service
- **[MaintenanceService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/maintenance/maintenance.service.ts)**: Stores active maintenance status flags in a fast Redis cache database layer for low latency checks.
