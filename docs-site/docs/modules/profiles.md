---
sidebar_position: 2
---

# Profiles Module

The `ProfilesModule` manages user profile attributes, including personal details, dates of birth, and gender indicators.

---

## 📋 Purpose & Responsibilities

- **Profile Retrieval (`/me` and `/:id`)**: Resolves personal profile metadata for the authenticated user or other matches.
- **Profile Creation & Update**: Handles validation and storage of profile details in the database.
- **De-normalization Management**: Keeps fields like first names updated across matching systems for performant rendering.

---

## 🛠 File & Class Definitions

### Controller
- **[ProfilesController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/profiles/profiles.controller.ts)**: Exposes endpoints to retrieve and edit user profiles.
  - Route Prefix: `/api/v1/profiles`

### Service
- **[ProfilesService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/profiles/profiles.service.ts)**: Implements validation and database updates for profile schemas.

---

## 🔄 Public APIs

- `GET /me`: Returns the authenticated user's profile.
- `PATCH /me`: Updates the user's profile (name, gender, date of birth).
- `GET /:id`: Retrieves another user's profile if there is an active match or communication channel between them.
