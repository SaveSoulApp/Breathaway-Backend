---
sidebar_position: 12
---

# Instagram Module

The `InstagramModule` manages OAuth integrations and profile syncing with Instagram APIs.

---

## 📋 Purpose & Responsibilities

- **Instagram OAuth**: Authenticates users against the Instagram Graph API.
- **Media Fetching**: Retrieves a user's recent posts/images to populate profile pictures or media grids within the BreathAway app.
- **Credential Storage**: Saves token data securely.

---

## 🧠 Business Logic & Core Concepts

### 1. Secret Manager Upserts

The service decouples user token operations from system token management. `refreshAccessToken` calls the Graph API to rotate a user's long-lived access token and returns it directly to the caller without mutating system secrets. `refreshSystemAccessToken` handles platform-level rotation: it retrieves the system token, refreshes it via the Graph API, and dynamically writes the new token back to GCP Secret Manager (`access-token-instagram`) via an upsert. This protects the operational system token from being overwritten by user tokens.

### 2. System Token Delegation

For automated maintenance jobs that interact with Instagram on behalf of the platform, `refreshSystemAccessToken` reads the current system token from Secret Manager (with ConfigService fallback), rotates it via the Graph API, and updates Secret Manager. This abstracts the credential source away from the maintenance jobs.

---

## 🛠 File & Class Definitions

### Controller

- **[InstagramController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/instagram/instagram.controller.ts)**: Exposes internal administrative endpoints for user and system token refresh operations, protected by `AdminBasicAuthGuard`.
  - Route Prefix: `/api/v1/instagram`

### Service

- **[InstagramService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/instagram/instagram.service.ts)**: Handles HTTP requests to the Instagram Graph API and exchanges authorization codes for access tokens.
