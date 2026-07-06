---
sidebar_position: 22
---

# Audit Module

The `AuditModule` is an internal utility that captures application action histories and dispatches them to an asynchronous event log.

---

## 📋 Purpose & Responsibilities

- **System Action Tracking**: Captures security-sensitive changes (such as authentication events, database edits, and payments).
- **Asynchronous Audit Logging**: Listens for internal `audit.log` events via NestJS `EventEmitter` and forwards them to a GCP Pub/Sub audit topic.
- **Fail-Safe Integrity**: Processes logs in non-blocking try-catch wrappers, ensuring logging failures never disrupt normal application flows.

---

## 🛠 File & Class Definitions

### Service
- **[AuditService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/audit/audit.service.ts)**: Contains the subscriber logic mapping internal events to Pub/Sub messages.
- Does not expose HTTP controllers.
