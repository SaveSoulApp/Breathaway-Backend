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

## 🧠 Business Logic & Core Concepts

### 1. Aggregated Reporting (Admin Dashboarding)

The `ReportsService` constructs massive aggregation queries directly via Prisma to generate statistical data for admin dashboarding. It fetches totals, demographics splits, identity distributions, device platforms, like intents, and credit usage ledgers across specific timeframes.

### 2. Raw SQL for Complex Joins

While Prisma handles most queries, the service uses `prisma.$queryRaw` for joining the `Like` table to the `Identity` table to calculate likes split by target identity type. This is because Prisma's standard aggregation syntax doesn't easily support cross-relation counting directly within a `groupBy` clause.

---

## 🛠 File & Class Definitions

### Controller

- **[ReportsController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/reports/reports.controller.ts)**: Handles reporting submissions.
  - Route Prefix: `/api/v1/reports`

### Service

- **[ReportsService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/reports/reports.service.ts)**: Validates reported user IDs, creates `Report` entries, and triggers moderation queues.
