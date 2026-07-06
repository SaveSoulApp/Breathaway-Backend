---
sidebar_position: 9
---

# Glossary

This glossary defines technical terms, abbreviations, and acronyms used throughout the BreathAway codebase and documentation.

---

### ULID (Universally Unique Lexicographically Sortable Identifier)
A 128-bit compatibility identifier that is lexicographically sortable, case-insensitive, and encoded as a 26-character string. We use ULIDs as the default primary keys in our PostgreSQL database models because they provide better index sorting performance than standard UUIDs.

### KMS (Key Management Service)
A Google Cloud service used to securely create, rotate, and manage cryptographic keys. We use Cloud KMS to manage the envelope encryption keys that protect sensitive user identity identifiers in our database.

### PII (Personally Identifiable Information)
Any data that can be used to distinguish or trace an individual's identity, such as phone numbers, email addresses, and names. Our architecture encrypts PII at rest to protect user privacy.

### DTO (Data Transfer Object)
An object that carries data between processes. In NestJS, we use DTO classes decorated with `class-validator` and `class-transformer` to parse, validate, and sanitize requests and responses.

### FCM (Firebase Cloud Messaging)
A cross-platform messaging solution that lets you reliably send notifications and messages. The `notifications` module integrates with FCM to send push alerts to mobile clients.

### Pub/Sub (Publish-Subscribe)
An asynchronous messaging service that decouples services that produce events from services that process events. The `pubsub` module acts as our gateway for queueing and listening to background events.

### Double-Entry Ledger
A system of bookkeeping where every entry to an account requires a corresponding and opposite entry to a different account. We use a double-entry ledger database pattern for `CreditLedger` to trace credit flow securely.
