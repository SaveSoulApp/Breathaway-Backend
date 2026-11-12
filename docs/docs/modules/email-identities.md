---
sidebar_position: 11
---

# Email Identities Module

The `EmailIdentitiesModule` (`src/modules/identities/email/`) is a dedicated sub-module of `IdentitiesModule` that manages in-house email one-time password (OTP) verification and links verified email addresses directly to customer accounts as `Identity` records.

---

## 📋 Purpose & Business Motivation

In the BreathAway platform, authenticated customers can sign in using their phone number or OAuth providers and may wish to link multiple email addresses (e.g. personal, work, secondary) to their account for discovery, matching, and transactional communications.

### Why In-House OTP Instead of Firebase Authentication?

1. **Avoiding Account Duplication**: Firebase Authentication creates a separate user account (`UserRecord`) for each email address registered. Registering secondary or auxiliary emails via Firebase would result in fragmented, duplicate user entities in Firebase Auth that are disconnected from the customer's primary account.
2. **Identity-Only Scope**: Secondary email addresses are purely for contactability, identity discovery, and matching. They are **not** login credentials (`AuthCredential`).
3. **Decoupled Delivery**: Leverages BreathAway's existing Brevo transactional email infrastructure, allowing custom Handlebars templates (`email-verification-otp.hbs`) and unified brand messaging.
4. **Zero Database Migrations**: Seamlessly reuses PostgreSQL's existing `Identity` schema (`type = 'EMAIL'`, deterministic HMAC-SHA256 indexing via `publicValueHash`, and envelope encryption).

---

## 🏗 System Architecture

The following diagram illustrates how the `EmailIdentitiesModule` coordinates with Redis for OTP state, emits domain events to the decoupled notification system for email dispatch, and delegates to `IdentitiesService` for database persistence:

```mermaid
flowchart TD
    subgraph ClientLayer["Client Layer"]
        CLIENT["Authenticated Client (JWT)"]
    end

    subgraph EmailSubModule["Email Identities Sub-Module (src/modules/identities/email/)"]
        CTRL["EmailIdentitiesController<br/>(identities/email)"]
        SVC["EmailVerificationService"]
    end

    subgraph CacheAndLimiter["Distributed State & Abuse Defense"]
        REDIS[("Redis Cache & Rate Limiter")]
    end

    subgraph EventSystem["Decoupled Notification Pipeline"]
        BUS(("EventEmitter2"))
        LISTENER["NotificationEventsListener"]
        EMAIL_SVC["EmailService.sendDirect()"]
        BREVO["Brevo SMTP / API"]
    end

    subgraph CoreIdentities["Root Identities Module & Database"]
        IDENT_SVC["IdentitiesService.claimOrCreateIdentity()"]
        CRYPTO["IdentityCryptoService (KMS)"]
        PG[("PostgreSQL (Cloud SQL)<br/>Identity Table")]
    end

    CLIENT -->|"1. POST /api/v1/identities/email/send-otp"| CTRL
    CLIENT -->|"2. POST /api/v1/identities/email/verify-otp"| CTRL
    CTRL --> SVC

    SVC -->|"Check / Set Cooldowns & Hourly Caps"| REDIS
    SVC -->|"Store Hashed OTP (TTL: 10m)"| REDIS
    SVC -->|"Validate Pre-flight Ownership"| PG

    SVC -->|"Emit EmailVerificationRequestedEvent"| BUS
    BUS --> LISTENER
    LISTENER -->|"Resolve Name & Dispatch"| EMAIL_SVC
    EMAIL_SVC -->|"Deliver Verification Email"| BREVO

    SVC -->|"Consume OTP & Delegate Claim"| IDENT_SVC
    IDENT_SVC -->|"Envelope Encryption (AES-256-GCM)"| CRYPTO
    IDENT_SVC -->|"Persist Identity (isVerified: true)"| PG
    IDENT_SVC -->|"Emit IDENTITY_ADDED_EVENT"| BUS
```

---

## 🔄 Sequence Diagrams

### 1. Requesting Email Verification OTP (`POST /api/v1/identities/email/send-otp`)

```mermaid
sequenceDiagram
    autonumber
    actor User as Authenticated Customer
    participant Client as Mobile App / Web Client
    participant Ctrl as EmailIdentitiesController
    participant Svc as EmailVerificationService
    participant Redis as Redis Cache
    participant DB as PostgreSQL (Identity Table)
    participant Bus as EventEmitter2
    participant Listener as NotificationEventsListener
    participant Email as EmailService
    participant Brevo as Brevo API

    User->>Client: Enters email to link
    Client->>Ctrl: POST /api/v1/identities/email/send-otp { email } (Bearer JWT)
    Ctrl->>Svc: sendEmailOtp(userId, dto)

    rect rgb(240, 248, 255)
        Note over Svc,DB: Step 1: Caller Self-Duplicate Check (Privacy-Preserving)
        Svc->>DB: findFirst(type: EMAIL, publicValueHash, userId, isVerified: true, deletedAt: null)
        alt Email already verified by caller
            Svc-->>Ctrl: 409 ConflictException ("Already verified")
            Ctrl-->>Client: 409 Conflict
        end
    end

    rect rgb(255, 245, 238)
        Note over Svc,Redis: Step 2: Multi-Tier Rate Limiting Checks
        Svc->>Redis: Check userCooldown, emailCooldown, userHourlyCap, emailHourlyCap
        alt Rate limit exceeded
            Svc-->>Ctrl: 429 OtpRateLimitExceededException
            Ctrl-->>Client: 429 Too Many Requests
        end
    end

    rect rgb(245, 255, 250)
        Note over Svc,Redis: Step 3: OTP Generation & Persistence
        Svc->>Svc: Generate 6-digit CSPRNG OTP (crypto.randomInt)
        Svc->>Svc: Hash OTP with SHA-256 (hashString)
        Svc->>Redis: SET email_verification_otp:<userId>:<emailHex> (TTL: 600s)
        Svc->>Redis: SET userCooldown (60s) & emailCooldown (60s)
        Svc->>Redis: INCR & EXPIRE userHourlyCap & emailHourlyCap (3600s)
    end

    rect rgb(255, 250, 240)
        Note over Svc,Brevo: Step 4: Asynchronous Notification Dispatch
        Svc->>Bus: emit(EMAIL_VERIFICATION_REQUESTED_EVENT)
        Svc-->>Ctrl: { message, expiresIn: 600, resendAfter: 60 }
        Ctrl-->>Client: 200 OK

        Bus->>Listener: handleEmailVerificationRequested (async)
        Listener->>DB: resolveUserFirstName(userId)
        Listener->>Email: sendDirect({ to, emailType, templateData })
        Email->>Brevo: Send email via Brevo SMTP / API
        Brevo-->>User: Delivers OTP Email
    end
```

---

### 2. Verifying OTP & Claiming Identity (`POST /api/v1/identities/email/verify-otp`)

```mermaid
sequenceDiagram
    autonumber
    actor User as Authenticated Customer
    participant Client as Mobile App / Web Client
    participant Ctrl as EmailIdentitiesController
    participant Svc as EmailVerificationService
    participant Redis as Redis Cache
    participant IdentSvc as IdentitiesService
    participant DB as PostgreSQL (Identity Table)
    participant Bus as EventEmitter2

    User->>Client: Enters 6-digit OTP code
    Client->>Ctrl: POST /api/v1/identities/email/verify-otp { email, otp } (Bearer JWT)
    Ctrl->>Svc: verifyEmailOtp(userId, dto)

    Svc->>Redis: GET email_verification_otp:<userId>:<emailHex>
    alt Session missing or expired
        Svc-->>Ctrl: 400 InvalidOtpException ("Expired or invalid")
        Ctrl-->>Client: 400 Bad Request
    end

    alt Stored attempts >= maxAttempts (5)
        Svc->>Redis: DEL key (burn)
        Svc-->>Ctrl: 400 InvalidOtpException ("Max attempts exceeded")
        Ctrl-->>Client: 400 Bad Request
    end

    rect rgb(240, 248, 255)
        Note over Svc: Step 1: Constant-Time Hash Comparison
        Svc->>Svc: Hash input OTP (SHA-256)
        Svc->>Svc: CryptoUtils.constantTimeEquals(inputHash, storedHash)
    end

    alt Code mismatch (attempts < 5)
        Svc->>Redis: Increment attempts counter
        Svc->>Redis: Check TTL. If TTL <= 0, burn key. Else update key with remaining TTL
        Svc-->>Ctrl: 400 InvalidOtpException ("X attempts remaining")
        Ctrl-->>Client: 400 Bad Request
    else Code matches
        rect rgb(245, 255, 250)
            Note over Svc,DB: Step 2: Atomic Consumption & Identity Claim
            Svc->>Redis: DEL email_verification_otp:<userId>:<emailHex>
            Svc->>IdentSvc: claimOrCreateIdentity(EMAIL, normalizedEmail, undefined, userId)
            IdentSvc->>DB: $transaction: check ownership & upsert Identity (isVerified: true)
            alt Email already claimed by another user
                IdentSvc-->>Svc: 409 IdentityAlreadyClaimedException
                Svc-->>Ctrl: 409 Conflict
                Ctrl-->>Client: 409 Conflict
            else Unclaimed or owned by caller
                IdentSvc->>Bus: emit(IDENTITY_ADDED_EVENT)
                IdentSvc-->>Svc: IdentityResponseDto (masked representation)
                Svc-->>Ctrl: IdentityResponseDto
                Ctrl-->>Client: 200 OK { id, type: "EMAIL", publicValueMasked: "u••••r@example.com", isVerified: true }
            end
        end
    end
```

---

## 🛡 Security & Abuse Protection Invariants

The `EmailVerificationService` enforces defense-in-depth across five security layers:

### 1. Multi-Tier Rate Limiting

- **User Cooldown**: Enforces a 60-second cooldown per authenticated user (`rate_limit:email_otp:user:<userId>`).
- **Email Cooldown**: Enforces a 60-second cooldown per target email address hash (`rate_limit:email_otp:email:<emailHex>`).
- **User Hourly Cap**: Limits an individual user to a maximum of 5 OTP requests per hour (`rate_limit:email_otp:hourly:<userId>`).
- **Email Hourly Cap**: Limits any individual email address to a maximum of 5 OTP requests per hour across all accounts (`rate_limit:email_otp:hourly:email:<emailHex>`). This protects third-party victim inboxes from distributed harassment attacks where an adversary rotates multiple accounts.
- **Zombie Key Prevention**: After executing Redis `INCR`, the service inspects key TTL. If the key was created without an expiration (`TTL = -1`), it automatically sets a 3,600-second TTL.

### 2. Cryptographic Security & High Entropy

- **CSPRNG Generation**: OTPs are generated using Node.js `crypto.randomInt(100000, 1000000)` providing $10^6$ equiprobable combinations.
- **Hashed Redis Storage**: Plain OTPs are never stored in Redis. Only deterministic SHA-256 digests (`hashString(plainOtp)`) are persisted.
- **Constant-Time Verification**: Verification digests are compared in constant time via `CryptoUtils.constantTimeEquals(bufA, bufB)`, preventing timing side-channel attacks.

### 3. Brute-Force & Replay Defenses

- **Maximum Attempt Threshold**: A single OTP allows a maximum of 5 attempts.
- **Atomic Burning**: If 5 failed attempts occur, or if an expired OTP is checked, the Redis key is burned immediately (`redisService.del`).
- **TTL Resurrect Guard**: When decrementing attempts on mismatch, if the remaining key TTL is $\le 0$, the session is immediately burned rather than resetting the TTL.

### 4. PII Redaction in Structured Logs

In compliance with GDPR and project logging standards (`AGENTS.md`), customer email addresses are never logged in plaintext. The service logs masked strings (e.g. `t••••t@example.com`) or HMAC hex digests (`emailHex`) in all operational log metadata.

---

## 📬 Decoupled Notification Integration

In adherence to the **Decoupled Notifications Golden Rule**:

- The `EmailVerificationService` **never** imports `NotificationsModule` or injects `NotificationsService`.
- Upon successful OTP generation, it emits `EmailVerificationRequestedEvent(userId, email, otp, expiresInSeconds)`.
- The central [`NotificationEventsListener`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/notifications/listeners/notification-events.listener.ts) intercepts the event asynchronously (`@OnEvent(..., { async: true })`), resolves the user's first name, and invokes [`EmailService.sendDirect()`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/notifications/email/email.service.ts).
- `EmailService.renderAndSend` compiles [`email-verification-otp.hbs`](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/notifications/templates/email-verification-otp.hbs), auto-merges layout defaults (`appUrl`, `currentYear`), and delivers the message via Brevo.

---

## 🛠 API Endpoints Specification

### 1. Request OTP

- **Route**: `POST /api/v1/identities/email/send-otp`
- **Auth**: `Bearer <JWT>`
- **Throttle**: Strict (`AUTH_STRICT_THROTTLE`)
- **Request Body**:
  ```json
  {
    "email": "personal.email@example.com"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "message": "Verification code sent to email",
    "expiresIn": 600,
    "resendAfter": 60
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation failure (malformed email).
  - `409 Conflict`: Email already verified and linked to the caller's own account (cross-account ownership is intentionally not disclosed here to prevent account enumeration).
  - `429 Too Many Requests`: Cooldown active or hourly cap exceeded.

### 2. Verify OTP & Link Identity

- **Route**: `POST /api/v1/identities/email/verify-otp`
- **Auth**: `Bearer <JWT>`
- **Throttle**: Strict (`AUTH_STRICT_THROTTLE`)
- **Request Body**:
  ```json
  {
    "email": "personal.email@example.com",
    "otp": "482910"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "id": "01JCARB5G6H7J8K9L0MNPQRSTU",
    "type": "EMAIL",
    "publicValueMasked": "p••••l@example.com",
    "isVerified": true,
    "verifiedAt": "2026-11-07T17:30:00.000Z",
    "createdAt": "2026-11-07T17:30:00.000Z",
    "userId": "user-uuid"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Code expired, invalid OTP, or maximum attempts exceeded.
  - `409 Conflict`: Email is already claimed by another user.
  - `429 Too Many Requests`: Rate limit exceeded.

---

## 📁 Source Code Organization

```
src/modules/identities/email/
├── dto/
│   ├── request/
│   │   ├── send-email-otp.request.dto.ts      # Validates email formatting and normalization
│   │   └── verify-email-otp.request.dto.ts    # Validates 6-digit numeric OTP code
│   ├── response/
│   │   └── send-email-otp.response.dto.ts     # Expiration and resend durations
│   └── index.ts                               # Barrel export
├── tests/
│   ├── email-identities.controller.spec.ts    # Controller route and DTO unit tests
│   └── email-verification.service.spec.ts     # Complete lifecycle, rate-limiting & security tests
├── email-identities.controller.ts             # REST controller mounted at identities/email
├── email-identities.module.ts                 # Sub-module definition (forwardRef to IdentitiesModule)
└── email-verification.service.ts              # Core OTP generation, Redis state, and claim coordination
```
