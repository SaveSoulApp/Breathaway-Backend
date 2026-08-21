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

The service doesn't just read tokens. `refreshAccessToken` calls the Graph API to rotate the long-lived user token, and then dynamically writes the new token back to GCP Secret Manager (`access-token-instagram`) via an upsert. This keeps credential rotation centralized and auditable.

### 2. System Token Delegation

For automated cron jobs that need to interact with Instagram on behalf of the platform, `refreshSystemAccessToken` reads the current system token from environment configuration and delegates to the standard rotation method. This abstracts the credential source away from the cron jobs.

---

## 🛠 File & Class Definitions

### Controller

- **[InstagramController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/instagram/instagram.controller.ts)**: Exposes endpoints for initiating OAuth flow and receiving redirect callback hooks.
  - Route Prefix: `/api/v1/instagram`

### Service

- **[InstagramService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/instagram/instagram.service.ts)**: Handles HTTP requests to the Instagram Graph API and exchanges authorization codes for access tokens.
