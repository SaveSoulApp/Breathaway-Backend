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

## 🛠 File & Class Definitions

### Controller
- **[InstagramController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/instagram/instagram.controller.ts)**: Exposes endpoints for initiating OAuth flow and receiving redirect callback hooks.
  - Route Prefix: `/api/v1/instagram`

### Service
- **[InstagramService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/instagram/instagram.service.ts)**: Handles HTTP requests to the Instagram Graph API and exchanges authorization codes for access tokens.
