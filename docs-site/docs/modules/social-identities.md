---
sidebar_position: 13
---

# Social Identities Module

The `SocialIdentitiesModule` handles linking secondary social network identities (Twitter, LinkedIn) to user profiles.

---

## 📋 Purpose & Responsibilities

- **Platform Linking**: Maps social identifiers (hashed and encrypted) to a user account.
- **Provider Validations**: Integrates with external OAuth endpoints to verify ownership of the linked accounts.

---

## 🧠 Business Logic & Core Concepts

### 1. Stateless Verification
The `verifyInstagramIdentity` method interacts with the Graph API purely to read data (followers, business status, verification badge). It is completely stateless—it does not persist anything in the database. It expects the caller (e.g., `IdentityWorkflows`) to handle state mutations after a successful read.

### 2. PII-Safe API Error Handling
If the Meta API returns an error response, the service extracts the error message but explicitly avoids logging the entire JSON payload. This is a deliberate design choice to prevent leaking PII (like Instagram usernames returned in error bodies) into the system logs.

---

## 🛠 File & Class Definitions

### Controller
- **[SocialIdentitiesController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/social-identities/social-identities.controller.ts)**: Handles registration of social link credentials.
  - Route Prefix: `/api/v1/social-identities`

### Service
- **[SocialIdentitiesService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/social-identities/social-identities.service.ts)**: Saves and manages social profiles inside the `Identity` model database layer.
