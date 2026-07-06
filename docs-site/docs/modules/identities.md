---
sidebar_position: 10
---

# Identities Module

The `IdentitiesModule` handles sensitive user identifier storage (emails, phone numbers) securely.

---

## 📋 Purpose & Responsibilities

- **Envelope Encryption**: Uses local AES-256-GCM encryption wrapped with Google Cloud KMS keys to protect user identity values at rest.
- **Hashed Lookup**: Maintains deterministic SHA-256 hashes (`publicValueHash`) of identifiers to perform fast, unique lookups without decrypting the whole database.
- **Verification Status**: Tracks verification timestamps (`isVerified`, `verifiedAt`) for identities.

---

## 🛠 File & Class Definitions

### Controller
- **[IdentitiesController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/identities/identities.controller.ts)**: Exposes endpoints for managing user identities.
  - Route Prefix: `/api/v1/identities`

### Service
- **[IdentitiesService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/identities/identities.service.ts)**: Handles encryption wrapper logic and queries Prisma for identity resolution.
