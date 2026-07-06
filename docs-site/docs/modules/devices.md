---
sidebar_position: 7
---

# Devices Module

The `DevicesModule` manages FCM (Firebase Cloud Messaging) device tokens, tying specific device platforms (Android, iOS) to users.

---

## 📋 Purpose & Responsibilities

- **Device Registration (`POST /`)**: Saves or updates a device token. If the token was previously mapped to another user, it updates the mapping to the new user.
- **Device De-registration (`DELETE /:token`)**: Removes token mappings, ensuring push alerts are no longer dispatched to a device after user logout.
- **Platform Identification**: Captures the device hardware platform (`ANDROID`, `IOS`), app versions, and device model info.

---

## 🧠 Business Logic & Core Concepts

### 1. PII-Safe Token Conflicts
When a push token unique constraint violation occurs (`P2002`) during registration or updates, `DevicesService` explicitly catches the Prisma error. It surfaces a custom `DeviceTokenAlreadyExistsException` (409 Conflict) while strictly ensuring that the push token itself is *not* logged, maintaining PII compliance in the system logs.

### 2. Implicit Ownership Guarding
All targeted operations (`getDeviceById`, `patchDevice`, `updateDevice`, `deleteDevice`) enforce user ownership implicitly. Instead of fetching the device and then authorizing, the service queries with `where: { id: deviceId, userId }`. If the device belongs to another user, it simply returns a `NotFoundException`, preventing enumeration attacks.

---

## 🛠 File & Class Definitions

### Controller
- **[DevicesController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/devices/devices.controller.ts)**: Handles registration and deletion endpoints.
  - Route Prefix: `/api/v1/devices`

### Service
- **[DevicesService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/devices/devices.service.ts)**: Implements token database upserts and cleanups.
