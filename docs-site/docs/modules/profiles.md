---
sidebar_position: 2
---

# Profiles Module

The `ProfilesModule` manages user profile identities, personal attributes, and privacy-focused visibility rules.

---

## 📋 Purpose & System Role

This module acts as the source of truth for user profile details (such as names, dates of birth, and gender representations). It enforces data format standards during onboarding and implements strict visibility boundaries to protect user privacy.

---

## ⚙️ Managed Profiles Data

The database records for `UserProfile` track the following parameters:
- **First Name**: The user's primary name (enforced length: 1 to 100 characters).
- **Last Name**: Optional family name.
- **Date of Birth**: Captured as a timestamp to compute user ages for matching algorithms.
- **Gender**: Classified using the `GenderType` enum (`MALE`, `FEMALE`, `NONBINARY`, `OTHER`).

---

## 🛠️ Core Module Capabilities

### 1. Onboarding Profile Initialization
During user onboarding (orchestrated by the workflows module), a profile record is created and linked to the new user ID. The module ensures that a user cannot progress in the app without completing their basic profile attributes.

### 2. Privacy-Scoped Visibility Gatekeeper
To prevent scraping and ensure privacy, profile details are not publicly accessible. The module enforces a strict access boundary:
- A user can always view their own profile.
- A user can only view another user's profile if they are an Administrator OR if there is an **`ACTIVE` Match relationship** between them. 
- Attempting to load the profile of a non-matched user results in access denial, preventing data exposure.

### 3. De-normalization & Search Synchronization
To optimize search queries and recommendations, the module coordinates with caching layers and indexes, ensuring profile details are available for match-matching lookups while maintaining PostgreSQL database normalization.
