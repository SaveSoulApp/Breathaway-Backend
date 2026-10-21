---
sidebar_position: 12
---

# Instagram Module

The `InstagramModule` manages OAuth integrations, profile syncing, and direct messaging with the Instagram Graph API.

---

## 📋 Purpose & Responsibilities

- **Instagram OAuth**: Authenticates users against the Instagram Graph API and manages access tokens.
- **Media Fetching**: Retrieves a user's recent posts/images to populate profile pictures or media grids within the BreathAway app.
- **Direct Messaging**: Dispatches automated direct messages to users via the Instagram Graph API (`/v24.0/me/messages`) within Meta's active 24-hour messaging window.
- **Credential Storage**: Securely reads and rotates access tokens stored in GCP Secret Manager (`access-token-instagram`).

---

## 🧠 Business Logic & Core Concepts

### 1. Direct Messaging via Meta Graph API (`sendDirectMessage`)

The service provides programmatic messaging capabilities using Meta's Direct Messaging endpoint (`POST https://graph.instagram.com/{version}/me/messages`):

- **Active 24-Hour Window**: Messages can be sent to users who have initiated a conversation with BreathAway's Instagram business account within the last 24 hours (e.g. sending an OTP for identity verification).
- **Configurable API Versioning**: Defaults to Graph API version `v24.0`, configurable at runtime via `INSTAGRAM_GRAPH_API_VERSION`.
- **Credential Resolution**: Resolves the system access token from GCP Secret Manager (`access-token-instagram`), with graceful fallback to `ConfigService` (`INSTAGRAM_ACCESS_TOKEN`).
- **Defensive Message Truncation**: Meta enforces a strict 1,000-character limit on message text. To prevent HTTP 400 errors (`OAuthException: (#100) Param text exceeds maximum character length`), `sendDirectMessage` defensively truncates any input exceeding 1,000 characters to 997 characters plus an ellipsis (`...`).

### 2. Secret Manager Upserts

The service decouples user token operations from system token management. `refreshAccessToken` calls the Graph API to rotate a user's long-lived access token and returns it directly to the caller without mutating system secrets. `refreshSystemAccessToken` handles platform-level rotation: it retrieves the system token, refreshes it via the Graph API, and dynamically writes the new token back to GCP Secret Manager (`access-token-instagram`) via an upsert. This protects the operational system token from being overwritten by user tokens.

### 3. System Token Delegation

For automated maintenance jobs that interact with Instagram on behalf of the platform, `refreshSystemAccessToken` reads the current system token from Secret Manager (with ConfigService fallback), rotates it via the Graph API, and updates Secret Manager. This abstracts the credential source away from the maintenance jobs.

---

## 🛠 File & Class Definitions

### Controller

- **[InstagramController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/instagram/instagram.controller.ts)**: Exposes internal administrative endpoints for user and system token refresh operations, protected by `AdminBasicAuthGuard`.
  - Route Prefix: `/api/v1/instagram`

### Service

- **[InstagramService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/instagram/instagram.service.ts)**: Handles HTTP requests to the Instagram Graph API, exchanges authorization codes for access tokens, rotates credentials, and sends direct messages.

### DTOs

- **[SendInstagramMessageRequestDto](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/instagram/dto/request/send-instagram-message.request.dto.ts)**: Validates outbound message payloads with `@IsNotEmpty()`, `@IsString()`, and `@MaxLength(1000)`.
- **[SendInstagramMessageResponseDto](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/instagram/dto/response/send-instagram-message.response.dto.ts)**: Standardized response envelope containing `recipientId` and `messageId` returned by Meta.
