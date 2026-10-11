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

## 🧠 Business Logic & Core Concepts

### 1. Dependency Injected App

The Firebase Admin SDK app instance is injected via dependency injection (`@Inject('FIREBASE_ADMIN_APP')`) rather than relying on the global package singleton state. This facilitates cleaner testing, allows multiple instances if needed, and ensures the app can be gracefully destroyed (`this.firebaseApp.delete()`) during module teardown.

### 2. Token Subject Enforcement

The `validateFirebaseToken` method doesn't just verify the JWT signature; it explicitly asserts that the decoded token's `uid` matches the `uid` claimed by the caller (`decodedToken.uid !== uid`). This prevents token-substitution attacks where a malicious user attempts to pass a valid token belonging to a different user ID.

---

## 🛠 File & Class Definitions

### Service

- **[FirebaseService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/firebase/firebase.service.ts)**: Interacts with the Firebase Admin Client. It contains methods like `verifyIdToken(token)` and `sendMulticast(payload)`.
- It does not expose HTTP controllers.
