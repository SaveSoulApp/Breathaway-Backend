---
sidebar_position: 11
---

# One-Time Passwords (OTP) Module

The `OneTimePasswordsModule` manages the lifecycle of OTP verification codes used for sign-in and secondary credential confirmation.

---

## 📋 Purpose & Responsibilities

- **OTP Generation**: Creates cryptographically secure numeric codes.
- **OTP Dispatch**: Routes the generated code to SMS providers (e.g. Twilio/SendGrid) or email services depending on the identity type.
- **Verification Logic**: Checks incoming codes against active hashes in the database or Redis cache, enforcing expiration times and retry limit thresholds to prevent brute-force attacks.

---

## 🧠 Business Logic & Core Concepts

### 1. Human-Readable "Slug" OTPs

Instead of using standard numeric 6-digit codes, the system generates cryptographically secure, human-readable kebab-case slugs (e.g., `word-word-word`) using the `random-word-slugs` utility. This approach reduces friction and makes manual entry less error-prone for users.

### 2. Secure Storage (No Plaintext OTPs)

To prevent exploitation in the event of a cache breach:

- The plain-text OTP is **never persisted**.
- Upon generation, the OTP is hashed, and this hash is used as the Redis key (`otp:<hashed_value>`) containing the authenticated `userId`.
- Verification requires hashing the client's input and performing a lookup against the hashed key.

### 3. Rate Limiting & Atomic Consumption

- **Sentinel Keys**: Before generating a new OTP, the system checks for a Redis sentinel key (`rate_limit:otp:${userId}`). If it exists, a `429 Too Many Requests` is thrown, enforcing strict burst limitations (defined by `OTP_RATE_LIMIT_TTL`).
- **Atomic Consumption**: When an OTP is successfully verified, its key is immediately deleted (`del` operation) from Redis, ensuring single-use atomicity.

---

## 🛠 File & Class Definitions

### Controller

- **[OneTimePasswordsController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/one-time-passwords/one-time-passwords.controller.ts)**: Handles sending and verifying OTP codes.
  - Route Prefix: `/api/v1/otps`

### Service

- **[OneTimePasswordsService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/one-time-passwords/one-time-passwords.service.ts)**: Implements generation, rate limiting, and matching validations.
