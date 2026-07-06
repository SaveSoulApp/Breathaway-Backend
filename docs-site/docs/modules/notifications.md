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

## 🧠 Business Logic & Core Concepts

### 1. Pub/Sub Fan-Out Architecture
The `dispatch` method publishes a `NOTIFICATION_SEND_REQUESTED` event to Pub/Sub instead of sending messages directly. The service then listens to its own event to perform the heavy lifting of fetching user preferences, loading device tokens, and dispatching concurrently to downstream providers (FCM, Email, WhatsApp).

### 2. Preference Gatekeeping
Before dispatching a message across any channel, the service fetches user preferences in bulk via `PreferencesService`. If a user has disabled a specific channel (e.g. `pushEnabled: false`), they are filtered out immediately. Device tokens are only queried for users who have opted into push notifications.

### 3. Template Interpolation
For push notifications, if the `title` or `body` are missing from the dispatch request, the service interpolates them dynamically via a centralized `PUSH_TEMPLATE_MAP` using the provided `payload`. This allows the caller to emit standard notification types without hardcoding display strings in business services.

---

## 🛠 File & Class Definitions

### Controller
- **[NotificationsController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/notifications/notifications.controller.ts)**: Handles managing user notification preferences.
  - Route Prefix: `/api/v1/notifications`

### Service
- **[NotificationsService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/notifications/notifications.service.ts)**: Validates target device tokens and sends notifications via the FCM adapter.
