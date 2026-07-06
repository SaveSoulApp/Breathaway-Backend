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

## 🛠 File & Class Definitions

### Controller
- **[OneTimePasswordsController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/one-time-passwords/one-time-passwords.controller.ts)**: Handles sending and verifying OTP codes.
  - Route Prefix: `/api/v1/otps`

### Service
- **[OneTimePasswordsService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/one-time-passwords/one-time-passwords.service.ts)**: Implements generation, rate limiting, and matching validations.
