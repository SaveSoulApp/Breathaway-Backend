---
sidebar_position: 18
---

# Reports Module

The `ReportsModule` handles user moderation and safety reports within the platform.

---

## 📋 Purpose & Responsibilities

- **Submit Report (`POST /`)**: Allows a user to flag another user's profile for offensive content, scamming, or behavioral violations.
- **Moderation Hook**: Saves report records in the database, automatically alerts the system admins, and flags the reported account for moderation review.

---

## 🛠 File & Class Definitions

### Controller
- **[ReportsController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/reports/reports.controller.ts)**: Handles reporting submissions.
  - Route Prefix: `/api/v1/reports`

### Service
- **[ReportsService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/reports/reports.service.ts)**: Validates reported user IDs, creates `Report` entries, and triggers moderation queues.
