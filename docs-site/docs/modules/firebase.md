---
sidebar_position: 8
---

# Firebase Module

The `FirebaseModule` provides a wrapper around the **Firebase Admin SDK** for token verification and push notifications.

---

## 📋 Purpose & Responsibilities

- **Authentication Integration**: Exposes methods to verify Firebase ID tokens passed by mobile clients during registration/login.
- **Push Notification Backend**: Houses core wrappers used by the `NotificationsModule` to send notification payloads to FCM.
- **Stateless Configuration**: Initializes the Firebase Admin instance using service account keys retrieved securely from GCP Secret Manager or configuration variables.

---

## 🛠 File & Class Definitions

### Service
- **[FirebaseService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/firebase/firebase.service.ts)**: Interacts with the Firebase Admin Client. It contains methods like `verifyIdToken(token)` and `sendMulticast(payload)`.
- It does not expose HTTP controllers.
