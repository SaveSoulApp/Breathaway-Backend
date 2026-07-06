---
sidebar_position: 17
---

# Chats Module

The `ChatsModule` manages user communication, text messages, channels, and conversation histories.

---

## 📋 Purpose & Responsibilities

- **Conversation Retrieval (`GET /conversations`)**: Lists active chat conversations for the authenticated user.
- **Message Operations**: Exposes endpoints to retrieve and write messages within a conversation channel.
- **Access Guarding**: Checks that a mutual `ACTIVE` match exists between the two users before permitting chat channel creation or message exchange.

---

## 🛠 File & Class Definitions

### Controller
- **[ChatsController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/chats/chats.controller.ts)**: Handles conversation and messaging endpoints.
  - Route Prefix: `/api/v1/chats`

### Service
- **[ChatsService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/chats/chats.service.ts)**: Validates active match states, saves messages, and notifies the target user using FCM push alerts.
