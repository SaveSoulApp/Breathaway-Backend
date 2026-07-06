---
sidebar_position: 20
---

# Webhooks Module

The `WebhooksModule` receives incoming, automated event payloads dispatched from external partners and platforms.

---

## 📋 Purpose & Responsibilities

- **Payload Verification**: Validates signature headers (such as secret keys or HMAC hashes) to prevent malicious or spoofed webhook payloads.
- **Asynchronous Ingestion**: Quickly acknowledges receipts with a `200 OK` or `202 Accepted` status, and forwards payload processing tasks to internal queues or event emitters.

---

## 🧠 Business Logic & Core Concepts

### 1. Composite Handler Pattern
After parsing an incoming Meta webhook (e.g., a direct message), the `handleMessageIntent` method loops over an array of injected `WebhookMessageHandler` implementations. It calls `.canHandle(message)` on each and stops at the first one that accepts it. This provides a pluggable architecture for handling different types of DMs (OTPs, support tickets, etc.) without modifying the core service.

### 2. Verification Protocol
The `verifyMetaWebhook` method enforces Meta's specific challenge-response protocol. When subscribing the webhook URL in the Meta Developer Portal, Meta sends a `GET` request with a challenge string. The service verifies the token and returns the *raw string* challenge (not a JSON object) to complete the handshake.

---

## 🛠 File & Class Definitions

### Controller
- **[WebhooksController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/webhooks/webhooks.controller.ts)**: Serves as the webhook receiver route.
  - Route Prefix: `/api/v1/webhooks`
  - `@SkipClientIdentity()` is applied since these routes are invoked by external servers.

### Service
- **[WebhooksService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/webhooks/webhooks.service.ts)**: Orchestrates signature checks and dispatches verified event bodies to downstream modules.
