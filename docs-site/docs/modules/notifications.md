---
sidebar_position: 25
---

# Notifications Module

The `NotificationsModule` coordinates sending push notifications to users for chat messages, matches, and system announcements.

---

## 📋 Purpose & Responsibilities

- **Push Dispatch**: Formats and sends notifications using Firebase Cloud Messaging (via `FirebaseService`).
- **User Preference Enforcement**: Verifies that a user's notification preferences permit push alerts before triggering dispatch.
- **Auditing**: Keeps records of sent notifications for tracing delivery states.

---

## 🛠 File & Class Definitions

### Controller
- **[NotificationsController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/notifications/notifications.controller.ts)**: Handles managing user notification preferences.
  - Route Prefix: `/api/v1/notifications`

### Service
- **[NotificationsService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/notifications/notifications.service.ts)**: Validates target device tokens and sends notifications via the FCM adapter.
