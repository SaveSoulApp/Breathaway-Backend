---
sidebar_position: 15
---

# Preferences Module

The `PreferencesModule` stores and serves user match-filtering preferences (such as target gender, age range, and search intents).

---

## 📋 Purpose & Responsibilities

- **Read/Write Preferences (`GET /` and `PATCH /`)**: Allows mobile clients to manage search criteria.
- **Matching Constraint Provider**: Exposes filters used by the matchmaker query engines to identify compatible profiles.

---

## 🛠 File & Class Definitions

### Controller
- **[PreferencesController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/preferences/preferences.controller.ts)**: Handles REST endpoints for reading and modifying preference states.
  - Route Prefix: `/api/v1/preferences`

### Service
- **[PreferencesService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/preferences/preferences.service.ts)**: Implements database operations for saving and retrieving user preference records.
