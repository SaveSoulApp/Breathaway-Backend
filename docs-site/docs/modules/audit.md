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

## 🧠 Business Logic & Core Concepts

### 1. Event Sinking (Decoupling)

The `AuditService` acts as a decoupled sink. It uses NestJS's `EventEmitter` to listen for internal `audit.log` application events. Feature modules emit events seamlessly without needing to know about Pub/Sub or the specific audit topic, keeping domain logic clean.

### 2. Non-Blocking Failures

If publishing the audit log to Pub/Sub fails, the service intentionally catches the error, logs it internally, and does _not_ throw. This guarantees that an audit log failure (e.g., a temporary GCP Pub/Sub outage) will never disrupt or roll back the originating business operation (like a successful payment or user block).

---

## 🛠 File & Class Definitions

### Service

- **[AuditService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/audit/audit.service.ts)**: Contains the subscriber logic mapping internal events to Pub/Sub messages.
- Does not expose HTTP controllers.
