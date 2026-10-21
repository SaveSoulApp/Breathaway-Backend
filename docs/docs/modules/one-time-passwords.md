---
sidebar_position: 11
---

# One-Time Passwords (OTP) Module

The `OneTimePasswordsModule` manages the lifecycle of OTP verification codes used for sign-in, account linking, and out-of-band social identity confirmation.

---

## 📋 Purpose & Responsibilities

- **OTP Generation**: Creates cryptographically secure numeric codes and human-readable slug tokens.
- **Natural Language Message Synthesis**: Synthesizes organic, high-entropy conversational message wrappers around tokens to avoid third-party bot/spam classification.
- **OTP Dispatch**: Routes generated tokens to delivery adapters or client payloads depending on the identity type.
- **Verification Logic**: Checks incoming tokens against active hashes in Redis, enforcing strict single-use atomic deletion and rate limiting thresholds.

---

## 🧠 Business Logic & Core Concepts

### 1. Human-Readable "Slug" OTPs

Instead of using rigid numeric codes that look artificial when messaged over social media, the system generates cryptographically secure, human-readable kebab-case slugs (e.g., `word-word-word`) using the `random-word-slugs` utility. This approach reduces manual typing errors while maintaining high entropy.

### 2. Anti-Spam Natural Language Synthesis (`OtpMessageGenerator`)

When users send an OTP to BreathAway via Instagram Direct Message, rigid templates like `"Your verification code is 123456"` frequently trip Meta's anti-spam heuristics and automated bot shields.

To prevent message suppression and account blocks, [`OtpMessageGenerator`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/one-time-passwords/utils/otp-message-generator.util.ts) dynamically constructs organic conversational messages using a combinatorial synthesizer:

- **Four Combinatorial Components**:
  1. **Intent / Greeting**: Conversational openers (e.g. `"Just registered on Breathaway."`, `"Setting up my profile today."`, `"Confirming my profile connection."`).
  2. **Transition**: Natural bridging phrases (e.g. `"Here is my"`, `"Sharing my"`, `"My details:"`).
  3. **Organic Reference Tag**: Replaces the word "code" with natural labels (e.g. `"profile tag: <slug>"`, `"reference key: <slug>"`, `"link tag: <slug>"`).
  4. **Closing**: Warm sign-offs (e.g. `"Looking forward to getting started!"`, `"Super pumped to explore Breathaway!"`).
- **Over 20,000 Unique Permutations**: Produces diverse phrasing across users.
- **Strict Forbidden Vocabulary**: Guaranteed invariant that generated text never contains `verify`, `verified`, `verification`, `verifying`, `code`, `codes`, or `app`, verified via automated regex property tests across 100 sample iterations.

### 3. Secure Storage (No Plaintext OTPs)

To prevent exploitation in the event of a cache breach:

- The plain-text OTP is **never persisted**.
- Upon generation, the OTP is hashed, and this hash is used as the Redis key (`otp:<hashed_value>`) containing the authenticated `userId`.
- Verification requires hashing the client's input and performing a lookup against the hashed key.

### 4. Rate Limiting & Atomic Consumption

- **Sentinel Keys**: Before generating a new OTP, the system checks for a Redis sentinel key (`rate_limit:otp:${userId}`). If it exists, a `429 Too Many Requests` is thrown, enforcing strict burst limitations (defined by `OTP_RATE_LIMIT_TTL`).
- **Atomic Single-Use Consumption**: When an OTP is successfully verified via `verifyAndConsumeOtp`, its key is immediately deleted (`del` operation) from Redis, ensuring single-use atomicity and preventing replay attacks.

---

## 🛠 File & Class Definitions

### Controller

- **[OneTimePasswordsController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/one-time-passwords/one-time-passwords.controller.ts)**: Handles sending and verifying OTP codes.
  - Route Prefix: `/api/v1/otps`

### Service

- **[OneTimePasswordsService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/one-time-passwords/one-time-passwords.service.ts)**: Implements generation, rate limiting, and matching validations.

### Utilities

- **[OtpMessageGenerator](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/one-time-passwords/utils/otp-message-generator.util.ts)**: High-entropy natural language synthesizer producing organic message copy that wraps slug tokens while strictly avoiding spam trigger words.
