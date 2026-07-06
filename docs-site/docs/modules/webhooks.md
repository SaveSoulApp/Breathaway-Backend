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

## 🛠 File & Class Definitions

### Controller
- **[WebhooksController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/webhooks/webhooks.controller.ts)**: Serves as the webhook receiver route.
  - Route Prefix: `/api/v1/webhooks`
  - `@SkipClientIdentity()` is applied since these routes are invoked by external servers.

### Service
- **[WebhooksService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/webhooks/webhooks.service.ts)**: Orchestrates signature checks and dispatches verified event bodies to downstream modules.
