---
sidebar_position: 4
---

# Matches Module

The `MatchesModule` stores and tracks established, mutual connections between users.

---

## 📋 Purpose & Responsibilities

- **List Active Matches (`GET /`)**: Returns a paginated list of mutual matching profiles.
- **Unmatch User (`DELETE /:id`)**: Permits a user to break a connection, changing the match status to `UNMATCHED`.
- **Match Queries**: Provides core lookup utility functions for other modules (e.g. ChatsModule) to confirm that two users have a valid active relationship before allowing communication.

---

## 🛠 File & Class Definitions

### Controller
- **[MatchesController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/matches/matches.controller.ts)**: Exposes endpoints for listing and terminating matches.
  - Route Prefix: `/api/v1/matches`

### Service
- **[MatchesService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/matches/matches.service.ts)**: Handles database writes and status updates (`ACTIVE`, `UNMATCHED`, `BLOCKED`) for the `Match` model.
