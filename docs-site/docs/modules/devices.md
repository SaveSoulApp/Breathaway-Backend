---
sidebar_position: 7
---

# Devices Module

The `DevicesModule` manages FCM (Firebase Cloud Messaging) device tokens, tying specific device platforms (`ANDROID`, `IOS`, and `WEB`) to users.

---

## 📋 Purpose & Responsibilities

- **Device Registration (`POST /api/v1/devices`)**: Saves or updates a device token. If the token was previously mapped to another user or deactivated, it reassigns and reactivates the token.
- **Multi-Device Support**: Allows a single user to maintain multiple active device tokens simultaneously (e.g., mobile phone and web browser), ensuring notifications are received on all active surfaces.
- **Device De-registration (`DELETE /api/v1/devices/:token`)**: Deactivates or removes token mappings, ensuring push alerts are no longer dispatched after user logout.
- **Platform Identification**: Captures the device hardware or browser platform (`ANDROID`, `IOS`, `WEB`), app/client versions, and device model info.

---

## 🧠 Business Logic & Core Concepts

### 1. Multi-Platform Support (`DevicePlatform`)

BreathAway supports three target platforms defined in Prisma `DevicePlatform`:
- `IOS`: Apple mobile devices (dispatched via APNs).
- `ANDROID`: Android mobile devices (dispatched via FCM Android payload).
- `WEB`: Modern desktop and mobile web browsers running Service Workers (dispatched via FCM WebPush).

Incoming API requests sending `platform: "web"` (case-insensitive) are automatically mapped to `DevicePlatform.WEB`.

### 2. Multi-Device Delivery & Token Lifecycle

- **Multi-Token Delivery**: The notification pipeline queries all active devices (`isActive: true`) for a user. Outgoing notifications are dispatched concurrently to all registered endpoints.
- **Dead Token Deactivation**: When FCM returns `messaging/registration-token-not-registered` or `messaging/invalid-registration-token`, the notification worker flags the token as inactive (`isActive: false`) to prevent repeated dispatch failures.
- **Reactivation on Re-Login**: When a user logs in again and registers an existing token, the service updates the `userId`, sets `isActive: true`, and updates `lastSeenAt`.

### 3. PII-Safe Token Conflicts

When a push token unique constraint violation occurs (`P2002`) during registration or updates, `DevicesService` explicitly catches the Prisma error. It surfaces a custom `DeviceTokenAlreadyExistsException` (409 Conflict) while strictly ensuring that the push token itself is _not_ logged, maintaining PII compliance in the system logs.

### 4. Implicit Ownership Guarding

All targeted operations (`getDeviceById`, `patchDevice`, `updateDevice`, `deleteDevice`) enforce user ownership implicitly. Instead of fetching the device and then authorizing, the service queries with `where: { id: deviceId, userId }`. If the device belongs to another user, it simply returns a `NotFoundException`, preventing enumeration attacks.

---

## 🌐 Web App Integration

For web clients (e.g., `/app`), browser Service Workers register an FCM Web token via `getToken(messaging, { vapidKey })` and send it to `POST /api/v1/devices` with `platform: "web"`.

For complete frontend step-by-step instructions, service worker setup, VAPID key configuration, foreground toast listeners, and deep link routing, see the **[Web Push Integration Guide](../api/web-push.md)**.

---

## 🛠 File & Class Definitions

### Controller

- **[DevicesController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/devices/devices.controller.ts)**: Handles registration and deletion endpoints.
  - Route Prefix: `/api/v1/devices`

### Service

- **[DevicesService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/devices/devices.service.ts)**: Implements token database upserts, platform mapping, and cleanups.
