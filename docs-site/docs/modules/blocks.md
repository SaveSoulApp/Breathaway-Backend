---
sidebar_position: 16
---

# Blocks Module

The `BlocksModule` provides user safety controls by maintaining user block lists.

---

## 📋 Purpose & Responsibilities

- **Block User (`POST /`)**: Creates a `Block` entry preventing interaction.
- **Unblock User (`DELETE /:userId`)**: Removes block restrictions.
- **Safety Enforcement**: Intercepts matching and message delivery flows. If a block relation exists between two users, matching is bypassed, and message routing is rejected.

---

## 🛠 File & Class Definitions

### Controller
- **[BlocksController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/blocks/blocks.controller.ts)**: Exposes endpoints for managing blocking relations.
  - Route Prefix: `/api/v1/blocks`

### Service
- **[BlocksService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/blocks/blocks.service.ts)**: Saves block records in the database, removes mutual active matches when a block is created, and checks for block status between users.
