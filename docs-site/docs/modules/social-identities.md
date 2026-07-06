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

## 🛠 File & Class Definitions

### Controller
- **[SocialIdentitiesController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/social-identities/social-identities.controller.ts)**: Handles registration of social link credentials.
  - Route Prefix: `/api/v1/social-identities`

### Service
- **[SocialIdentitiesService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/social-identities/social-identities.service.ts)**: Saves and manages social profiles inside the `Identity` model database layer.
