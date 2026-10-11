---
sidebar_position: 25
---

# Notifications Module

The `NotificationsModule` provides BreathAway's multi-channel notification infrastructure, orchestrating transactional emails (via Brevo), push notifications (via Firebase Cloud Messaging), SMS/WhatsApp alerts, and a persistent **In-App Notification Center** backed by PostgreSQL. It features an event-driven Pub/Sub fan-out pipeline, dynamic Handlebars templating with layout inheritance, envelope-encrypted recipient email resolution, strict user preference gatekeeping, and multi-device in-app inbox synchronization.

---

## 📋 Purpose & Responsibilities

- **Multi-Channel Dispatch**: Distributes notifications across **Email** (Brevo / Mailgun / SendGrid SMTP API), **Push** (Firebase Cloud Messaging: iOS, Android, WebPush), and **WhatsApp** (LiteApp / Meta Cloud API) without duplicating business logic.
- **In-App Notification Center & Durable Storage**: Persists push-targeted communications in PostgreSQL with polymorphic JSONB payloads, read/unread states, and dismissal tracking, powering real-time inbox feeds and badge counters across all user devices.
- **Selective Push Channel Persistence**: Enforces a strict separation between transient delivery protocols (Email, WhatsApp) and persistent in-app notifications. Only communications routed through the `PUSH` channel are written to the database.
- **Segregated Controller Architecture**: Separates public client inbox interactions (`NotificationsController` secured by `JwtAuthGuard`) from administrative dispatch endpoints (`NotificationsAdminController` secured by `AdminBasicAuthGuard`).
- **Two-Phase Sequential Dispatch**: Guarantees database record creation before provider network transmission, eliminating the "push-to-open" race condition when mobile users tap notifications.
- **Zero-Migration Classification Architecture**: Utilizes varchar-backed database columns with TypeScript enums for `NotificationType`, `NotificationCategory`, and `NotificationPriority`, enabling instant taxonomy additions without database DDL schema migrations.
- **Asynchronous Pub/Sub Fan-Out**: Decouples API endpoints from downstream notification providers using Google Cloud Pub/Sub, ensuring sub-80ms client response times.
- **Transactional Email Engine**: Pre-compiles and caches responsive HTML templates via Handlebars, applies brand styling and partials (`header.hbs`, `footer.hbs`), and executes personalized interpolations.
- **Decoupled Recipient Identity Resolution**: Encapsulates envelope-encrypted identity unwrapping and contact standardization (ITU-T E.164 phone normalization, lowercase trimmed emails) inside a dedicated `NotificationRecipientResolverService`, keeping delivery providers lean and isolated from direct database queries.
- **WhatsApp Alert Infrastructure**: Connects to the LiteApp gateway with pluggable adapter patterns (`IWhatsAppAdapter`), rate-limiting 429 exponential retry, Redis-backed 24-hour event deduplication, and bilingual Meta approved template mapping.
- **Preference Gatekeeping**: Enforces granular user privacy settings (`pushEnabled`, `emailEnabled`, `whatsappEnabled`) via `PreferencesService` before dispatching to provider networks.
- **Double-Blind & PII Protection**: Guarantees zero leak of sensitive user identities during social notifications (e.g., likes remain secret until mutual matches are confirmed; security alerts mask identifiers).

---

## 🏗 Multi-Channel & In-App Notification Architecture

The following diagram illustrates how user actions trigger notifications via domain events, how events fan out through Cloud Pub/Sub, how the two-phase pipeline persists in-app records and fans out to provider adapters, and how client applications query the In-App Notification Center.

```mermaid
flowchart TD
    subgraph Triggering_Domains["Triggering Domain Services (Decoupled)"]
        AUTH["AuthService<br/>(Signup, Signin, Add Auth)"]
        LIKES["LikesService<br/>(Create Like, Delete Like)"]
        MATCH["MatchResolverService<br/>(Mutual Match Detection)"]
        CREDITS["CreditsService<br/>(Grant, Consume, Expiry Warning)"]
        MAINT["MaintenanceService<br/>(Likes Expired Cron)"]
        IDENT["IdentitiesService<br/>(Add / Remove Identity)"]
        DEV["DevicesService<br/>(Register Device)"]
    end

    subgraph Event_Bus["In-Memory Event Bus"]
        BUS(("NestJS EventEmitter2<br/>(BaseService.eventEmitter)"))
    end

    subgraph Notification_Listener["Notifications Module Listener"]
        LISTENER["NotificationEventsListener<br/>(@OnEvent(..., { async: true }))"]
        RESOLVE["resolveUserFirstName(userId)"]
        DISPATCH["NotificationsService.dispatch()"]
    end

    subgraph Messaging["Google Cloud Pub/Sub"]
        PUBSUB[("Topic: notifications-stream<br/>Event: NOTIFICATION_SEND_REQUESTED")]
    end

    subgraph Consumer["Pub/Sub Consumer: processSendRequest()"]
        PROCESSOR["NotificationsService.processSendRequest()"]
        ENRICH["enrichRecipientProfile() & interpolateContent()"]
        PREFS["PreferencesService.getPreferencesMany()"]

        subgraph Phase_1["Phase 1: DB Persistence (Push Only)"]
            PERSIST{"channels includes PUSH?"}
            DB_WRITE[("Prisma: Notification Table<br/>(PostgreSQL Storage)")]
            ATTACH_ID["dto.id = record.id<br/>(Prevents Push-to-Open Race)"]
        end

        subgraph Phase_2["Phase 2: Concurrent Fan-Out (allSettled)"]
            SEND_PUSH["sendPushNotification()"]
            SEND_EMAIL["sendEmailNotification()"]
            SEND_WA["sendWhatsAppNotification()"]
        end
    end

    subgraph Identity_Layer["Identity & Cryptographic Resolution"]
        RESOLVER["NotificationRecipientResolverService<br/>(AuthCredential & Identity Fallback Decryption)"]
    end

    subgraph Providers["External Delivery Providers & Adapters"]
        FCM["FcmProviderService<br/>(Firebase Cloud Messaging: iOS, Android, WebPush)"]
        EMAIL_SVC["EmailService<br/>(Handlebars Layout & Caching)"]
        BREVO["BrevoEmailAdapter / Mailgun / SendGrid<br/>(IEmailAdapter)"]
        WA_SVC["WhatsAppProviderService<br/>(Redis 24h Dedup & Template Registry)"]
        LITEAPP["LiteAppWhatsAppAdapter<br/>(IWhatsAppAdapter: LiteApp / Meta API)"]
    end

    subgraph Client_Inbox["In-App Notification Center (Client Facing)"]
        CLIENT["Mobile App / Web App"]
        CTRL["NotificationsController<br/>(/v1/notifications) [JwtAuthGuard]"]
    end

    AUTH -->|USER_WELCOME_EVENT| BUS
    LIKES -->|LIKE_SENT / WITHDRAWN| BUS
    MATCH -->|MATCH_CREATED_EVENT| BUS
    CREDITS -->|CREDITS_PURCHASED / USED / EXPIRING| BUS
    MAINT -->|LIKES_EXPIRED_EVENT| BUS
    IDENT -->|IDENTITY_ADDED / REMOVED| BUS
    DEV -->|DEVICE_ADDED_EVENT| BUS

    BUS --> LISTENER
    LISTENER --> RESOLVE
    RESOLVE --> DISPATCH
    DISPATCH --> PUBSUB
    PUBSUB --> PROCESSOR
    PROCESSOR --> ENRICH
    ENRICH --> PREFS
    PREFS --> PERSIST

    PERSIST -->|Yes| DB_WRITE
    DB_WRITE --> ATTACH_ID
    ATTACH_ID --> SEND_PUSH
    PERSIST -->|No / Done| SEND_EMAIL
    PERSIST -->|No / Done| SEND_WA

    SEND_PUSH -->|pushEnabled: true| FCM
    SEND_EMAIL -->|emailEnabled: true| EMAIL_SVC
    EMAIL_SVC --> RESOLVER
    EMAIL_SVC --> BREVO

    SEND_WA -->|whatsappEnabled: true| WA_SVC
    WA_SVC --> RESOLVER
    WA_SVC --> LITEAPP

    CLIENT -->|GET /unread-count, GET /, PATCH /:id/read| CTRL
    CTRL -->|Queries & Updates| DB_WRITE
```

---

## 📬 In-App Notification Center & Durable Storage

### 1. The Durability Challenge: Account-Level vs. Device-Level Notifications

Standard push notifications delivered via APNs or FCM are **device-bound and ephemeral**:

- If a user dismisses a push notification banner on their phone, the notification is gone.
- If a user installs the application on a second phone or logs in via the web app, device push history is not synchronized.
- Critical messages (matches, credit updates, security alerts) require an audit log that users can reference inside the app.

The **In-App Notification Center** solves this by establishing a durable, PostgreSQL-backed inbox for each user account. Whenever an alert is triggered, it is stored in the database, allowing clients to query unread badge counts, browse paginated inbox history, and synchronize read states across all registered devices.

### 2. The Selective Push Persistence Rule

> [!IMPORTANT]
> **Database Persistence Policy**: Only notifications routed through the `PUSH` channel (`NotificationChannel.PUSH`) are persisted to the database.

- **Why Not Email or WhatsApp?**
  Emails (receipts, legal notices, onboarding summaries) and WhatsApp chats already possess native persistence within the recipient's external mail client or chat messenger. Duplicating every transactional email into the in-app notification center would cause inbox clutter and unnecessary database row expansion.
- **Multi-Channel Combination**:
  When a communication is dispatched across multiple channels (e.g., `channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL]` for a new match or security alert), the presence of `PUSH` triggers persistence. The user receives both an external email and an in-app notification record.

### 3. Database Schema & Composite Indexes

In-app notifications are stored in the `Notification` table in PostgreSQL:

```prisma
model Notification {
  id String @id @default(ulid())

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  type     String @db.VarChar(64)
  category String @db.VarChar(32)
  priority String @default("NORMAL") @db.VarChar(16)

  title String
  body  String

  action String?
  link   String?
  data   Json?   @db.JsonB

  isRead      Boolean   @default(false)
  readAt      DateTime? @db.Timestamptz
  isDismissed Boolean   @default(false)

  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt @db.Timestamptz

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, isRead])
  @@index([userId, category])
}
```

#### Field Specifications

| Field         | Type                  | Description                                                                                              |
| :------------ | :-------------------- | :------------------------------------------------------------------------------------------------------- |
| `id`          | `String` (ULID)       | Lexicographically sortable unique identifier generated via `ulid()`.                                     |
| `userId`      | `String`              | Foreign key referencing `User(id)` with `onDelete: Cascade`.                                             |
| `type`        | `String (VarChar 64)` | Actionable event type (e.g., `NEW_MATCH`, `CREDITS_PURCHASED`). Zero-migration string backed by TS enum. |
| `category`    | `String (VarChar 32)` | Grouping identifier (e.g., `SOCIAL`, `SECURITY`, `BILLING`). Zero-migration string backed by TS enum.    |
| `priority`    | `String (VarChar 16)` | Delivery priority (`LOW`, `NORMAL`, `HIGH`, `CRITICAL`). Default: `NORMAL`.                              |
| `title`       | `String`              | Human-readable notification header.                                                                      |
| `body`        | `String`              | Formatted notification text.                                                                             |
| `action`      | `String?`             | Navigation intent indicator (e.g., `NAVIGATE`, `OPEN_MODAL`).                                            |
| `link`        | `String?`             | Deep link route (e.g., `/matches/01HM...`, `/credits/history`).                                          |
| `data`        | `Json? (JsonB)`       | Polymorphic metadata payload (e.g., `matchId`, `creditsAdded`, `avatarUrl`) for client UI hydration.     |
| `isRead`      | `Boolean`             | `false` until explicitly marked as read by the client.                                                   |
| `readAt`      | `DateTime?`           | Timestamp recording when the user opened or read the notification.                                       |
| `isDismissed` | `Boolean`             | `true` when the user deletes or dismisses the notification from their inbox feed.                        |

#### Performance & Indexing Strategy

1. **`@@index([userId, createdAt(sort: Desc)])`**: Optimizes the primary inbox feed query (`getUserNotifications`). Ensures reverse-chronological sorting and cursor-based pagination execute without table scans.
2. **`@@index([userId, isRead])`**: Powers the high-frequency badge count query (`getUnreadCount`), enabling constant-time evaluation of `isRead: false` and `isDismissed: false`.
3. **`@@index([userId, category])`**: Optimizes filtered category tab queries (e.g., filtering inbox by `SOCIAL` or `BILLING`).

---

## 🏷️ Dynamic String-Backed Classification Architecture

### Why Zero-Migration String Columns?

Rather than creating PostgreSQL native enums (`CREATE TYPE notification_type AS ENUM (...)`), BreathAway stores `type`, `category`, and `priority` as `@db.VarChar(...)` strings.

- **The Problem with Native Enums**: Adding or reordering values in PostgreSQL native enums requires executing DDL database migrations (`ALTER TYPE ... ADD VALUE`). In high-traffic production environments, DDL operations risk table locks, cannot run cleanly inside standard transaction blocks, and introduce deployment ordering friction between backend application code and Cloud SQL databases.
- **The Solution**: String columns paired with strict TypeScript enums, `class-validator` decorators, and OpenAPI Swagger schemas. New notification types and categories can be introduced immediately in application code with zero downtime and zero database migrations.

### 1. `NotificationType` Catalog (15 Types)

| Type                    | Default Category | Description                                                                   | Primary Channels |
| :---------------------- | :--------------- | :---------------------------------------------------------------------------- | :--------------- |
| `WELCOME`               | `MARKETING`      | Onboarding welcome notification after account creation or email verification. | Email, Push      |
| `LIKE_SENT`             | `SOCIAL`         | Confirmation to sender that their double-blind like was safely dispatched.    | Email, Push      |
| `NEW_MATCH`             | `SOCIAL`         | Mutual match confirmation dispatched concurrently to both users.              | Email, Push      |
| `NEW_MESSAGE`           | `SOCIAL`         | Alert notifying user of a new direct chat message.                            | Push             |
| `LIKE_WITHDRAWN`        | `SOCIAL`         | Confirmation that sender cancelled a pending like.                            | Email            |
| `LIKES_EXPIRED`         | `REMINDER`       | Batch alert when pending likes surpass the 90-day retention threshold.        | Email, Push      |
| `CREDITS_PURCHASED`     | `BILLING`        | Receipt and ledger update confirmation for purchased credit bundles.          | Email, Push      |
| `CREDITS_USED`          | `BILLING`        | Debit confirmation when credits are consumed for likes or connections.        | Email, Push      |
| `BUNDLE_EXPIRY_WARNING` | `REMINDER`       | Proactive notice that time-limited credits will expire soon (2 or 7 days).    | Email, Push      |
| `CREDIT_UPDATE`         | `BILLING`        | Administrative or system credit adjustments.                                  | Email, Push      |
| `PAYMENT_COMPLETED`     | `BILLING`        | Invoice receipt after subscription renewal or one-time store checkout.        | Email            |
| `IDENTITY_ADDED`        | `SECURITY`       | Security alert when a new contact method (phone, email, social) is linked.    | Email, Push      |
| `IDENTITY_REMOVED`      | `SECURITY`       | Security alert when an existing contact method is unlinked or deleted.        | Email, Push      |
| `DEVICE_ADDED`          | `SECURITY`       | Security alert when a new device registers an active push token.              | Email, Push      |
| `SYSTEM_ALERT`          | `SYSTEM`         | Administrative broadcast or platform maintenance alert.                       | Email, Push      |

### 2. `NotificationCategory` Catalog (7 Categories)

Categories group notifications for user preference toggles, client inbox filtering tabs, and retention rules:

```typescript
export enum NotificationCategory {
  SOCIAL = 'SOCIAL', // Likes, matches, chat messages, connection events
  SECURITY = 'SECURITY', // Device additions, credential modifications, auth alerts
  BILLING = 'BILLING', // Purchases, receipts, credit debits, subscriptions
  REMINDER = 'REMINDER', // Like expiration, credit bundle expiration warnings
  MARKETING = 'MARKETING', // Onboarding welcome, engagement campaigns, promotional offers
  SYSTEM = 'SYSTEM', // Maintenance announcements, operational alerts
  SUPPORT = 'SUPPORT', // Support ticket updates, resolution notifications
}
```

### 3. `NotificationPriority` Catalog (4 Tiers)

```typescript
export enum NotificationPriority {
  LOW = 'LOW', // Non-urgent background updates (e.g., marketing digests)
  NORMAL = 'NORMAL', // Standard user notifications (e.g., like sent, credit used)
  HIGH = 'HIGH', // Time-sensitive events (e.g., new match, bundle expiring soon)
  CRITICAL = 'CRITICAL', // Urgent security alerts (e.g., new device added, password reset)
}
```

---

## 🛡️ Controller Architecture & API Reference

To maintain clean security boundaries and eliminate redundant method-level guards, notification endpoints are segregated into two distinct controllers sharing the `/v1/notifications` route prefix.

```
src/modules/notifications/
├── notifications.controller.ts        # Client-facing In-App Inbox API (JwtAuthGuard)
└── notifications-admin.controller.ts  # Administrative & System Dispatch API (AdminBasicAuthGuard)
```

### 1. Client Inbox Controller (`NotificationsController`)

- **Base Route**: `/api/v1/notifications`
- **Security**: Class-level `@UseGuards(JwtAuthGuard)` and `@ApiBearerAuth()`.
- **Target Audience**: Mobile apps (iOS/Android) and Web apps (PWA/Desktop).

#### Endpoints Reference

| Method   | Endpoint        | Description                                                  | Request Query / Body         | Response Status & Shape                        |
| :------- | :-------------- | :----------------------------------------------------------- | :--------------------------- | :--------------------------------------------- |
| `GET`    | `/`             | Paginated notification inbox feed sorted newest first.       | `GetNotificationsRequestDto` | `200 OK` → `PaginatedNotificationsResponseDto` |
| `GET`    | `/unread-count` | Real-time unread badge count for tab bar / app icons.        | _None_                       | `200 OK` → `UnreadCountResponseDto`            |
| `PATCH`  | `/:id/read`     | Marks a single notification as read. Idempotent.             | `id` (param: ULID)           | `200 OK` → `NotificationResponseDto`           |
| `POST`   | `/read-all`     | Atomically marks all unread notifications as read.           | _None_                       | `200 OK` → `BatchReadResponseDto`              |
| `DELETE` | `/:id`          | Soft-dismisses a notification from user's active inbox view. | `id` (param: ULID)           | `204 No Content`                               |

#### Endpoint Details & Payloads

##### `GET /api/v1/notifications`

Fetches the current user's inbox with cursor-based pagination and optional category filtering:

- **Query Parameters**:
  - `limit` (optional, number, 1–100, default: `20`): Number of items per page.
  - `cursor` (optional, string, ULID): Notification ID from the previous page's `nextCursor`.
  - `category` (optional, enum: `NotificationCategory`): Filters by category (e.g. `SOCIAL`, `SECURITY`).
  - `unreadOnly` (optional, boolean, default: `false`): If `true`, only returns unread notifications.

- **Response Example (`200 OK`)**:
  ```json
  {
    "items": [
      {
        "id": "01J9H2X8W5B47N0K6P8R9Q1Z2A",
        "userId": "01J9H0X1A2B3C4D5E6F7G8H9J0",
        "type": "NEW_MATCH",
        "category": "SOCIAL",
        "priority": "HIGH",
        "title": "It's a Match! 💫",
        "body": "You and Sarah liked each other!",
        "action": "NAVIGATE",
        "link": "/matches/01J9H2Z4...",
        "data": {
          "matchId": "01J9H2Z4...",
          "name": "Sarah",
          "chatUrl": "/matches/01J9H2Z4..."
        },
        "isRead": false,
        "readAt": null,
        "createdAt": "2026-10-01T12:00:00.000Z"
      }
    ],
    "nextCursor": "01J9H2X8W5B47N0K6P8R9Q1Z2A",
    "hasMore": false,
    "unreadCount": 1
  }
  ```

##### `GET /api/v1/notifications/unread-count`

Used by mobile and web clients on app resume or websocket heartbeat to render badge counts:

- **Response Example (`200 OK`)**:
  ```json
  {
    "unreadCount": 3
  }
  ```

##### `PATCH /api/v1/notifications/:id/read`

Marks a specific notification as read. If the notification is already read, it returns the current record without executing an unnecessary database write:

- **Response Example (`200 OK`)**:
  ```json
  {
    "id": "01J9H2X8W5B47N0K6P8R9Q1Z2A",
    "userId": "01J9H0X1A2B3C4D5E6F7G8H9J0",
    "type": "NEW_MATCH",
    "category": "SOCIAL",
    "priority": "HIGH",
    "title": "It's a Match! 💫",
    "body": "You and Sarah liked each other!",
    "action": "NAVIGATE",
    "link": "/matches/01J9H2Z4...",
    "data": { "matchId": "01J9H2Z4..." },
    "isRead": true,
    "readAt": "2026-10-01T12:05:30.123Z",
    "createdAt": "2026-10-01T12:00:00.000Z"
  }
  ```

##### `POST /api/v1/notifications/read-all`

Atomically marks all active unread notifications (`isRead: false, isDismissed: false`) for the authenticated user as read:

- **Response Example (`200 OK`)**:
  ```json
  {
    "updatedCount": 5
  }
  ```

##### `DELETE /api/v1/notifications/:id`

Soft-dismisses the notification (`isDismissed: true`), excluding it from future inbox queries and unread calculations while maintaining ledger history:

- **Response**: `204 No Content`

---

### 2. Administrative Dispatch Controller (`NotificationsAdminController`)

- **Base Route**: `/api/v1/notifications`
- **Security**: Class-level `@UseGuards(AdminBasicAuthGuard)` and `@ApiBasicAuth()`.
- **Target Audience**: Internal administrative tooling, automated workflows, and backend system operators.

#### Endpoint: `POST /api/v1/notifications/send`

Queues a multi-channel notification for one or more users via Cloud Pub/Sub:

- **Request Body (`SendNotificationRequestDto`)**:

  ```json
  {
    "channels": ["PUSH", "EMAIL"],
    "userIds": ["01J9H0X1A2B3C4D5E6F7G8H9J0"],
    "type": "SYSTEM_ALERT",
    "category": "SYSTEM",
    "priority": "HIGH",
    "title": "Scheduled Maintenance Notice",
    "body": "BreathAway will undergo scheduled maintenance tonight at 02:00 UTC.",
    "link": "/announcements/maintenance",
    "payload": {
      "alertTitle": "Scheduled Maintenance Notice"
    }
  }
  ```

- **Response (`202 Accepted`)**:
  ```json
  {
    "success": true,
    "message": "Notification dispatch requested for 1 users",
    "userCount": 1
  }
  ```

---

## ⚙️ Two-Phase Sequential Dispatch Pipeline

The notification processing core inside `NotificationsService.processSendRequest` executes a two-phase pipeline designed for **data integrity, latency, and race-condition immunity**.

```typescript
// NotificationsService.processSendRequest (Conceptual Walkthrough)
async processSendRequest(dto: SendNotificationRequestDto): Promise<void> {
  // 1. Enrich recipient profile (fallback firstName resolution)
  await this.enrichRecipientProfile(dto);
  this.interpolateContent(dto);

  // 2. Fetch user preferences in bulk
  const preferencesMap = await this.preferencesService.getPreferencesMany(dto.userIds);
  const channels = dto.channels ?? [NotificationChannel.PUSH];

  // ─────────────────────────────────────────────────────────────
  // Phase 1: Database Persistence (Sequential & Authoritative)
  // ─────────────────────────────────────────────────────────────
  if (channels.includes(NotificationChannel.PUSH)) {
    await this.persistNotifications(dto);
  }

  // ─────────────────────────────────────────────────────────────
  // Phase 2: Provider Fan-Out (Concurrent via Promise.allSettled)
  // ─────────────────────────────────────────────────────────────
  const promises: Promise<void>[] = [];

  if (channels.includes(NotificationChannel.PUSH)) {
    promises.push(this.sendPushNotification(dto, preferencesMap));
  }
  if (channels.includes(NotificationChannel.EMAIL)) {
    promises.push(this.sendEmailNotification(dto, preferencesMap, ctx));
  }
  if (channels.includes(NotificationChannel.WHATSAPP)) {
    promises.push(this.sendWhatsAppNotification(dto, preferencesMap));
  }

  await this.awaitChannelDispatches(promises, ctx);
}
```

### 1. Eliminating the "Push-to-Open" Race Condition

A common defect in mobile notification architectures occurs when push notifications are sent concurrently with or prior to database storage:

1. FCM delivers the push alert to the client device in under 50ms.
2. The user taps the notification banner immediately.
3. The mobile application opens, routes to `/inbox`, and calls `GET /v1/notifications` or `PATCH /v1/notifications/:id/read`.
4. If the database transaction has not completed, the notification does not exist in the user's inbox, causing a `404 Not Found` or empty screen.

**The BreathAway Solution**:

- **Phase 1** executes sequentially _before_ any provider dispatches.
- In `persistNotifications`, when `userIds.length === 1`, the generated database record ID is assigned to `dto.id = record.id`.
- The outgoing FCM payload receives this exact database ID. When the user taps the push notification, the database record is guaranteed to already exist in PostgreSQL.

### 2. Resilient Concurrent Provider Fan-Out

In **Phase 2**, downstream provider transmissions (`sendPushNotification`, `sendEmailNotification`, `sendWhatsAppNotification`) execute concurrently using `Promise.allSettled()`:

- **Fault Isolation**: A transient SMTP failure or rate limit in Brevo will **never** block FCM push notification dispatch or WhatsApp delivery.
- **Structured Error Logging**: Rejected promises are logged with structured context (`step: 'provider_dispatch'`, `providerIndex`, `serializeError`), allowing Cloud Logging alerting policies to track specific provider health without throwing unhandled exceptions to Pub/Sub.

### 3. Lean Method Decomposition

To ensure testability and high maintainability, `NotificationsService` divides dispatch mechanics into focused, single-responsibility methods:

- `enrichRecipientProfile(dto)`: Resolves recipient `firstName` from `UserProfile` if omitted in the payload.
- `interpolateContent(dto)`: Resolves title, body, and deep links from `PUSH_TEMPLATE_MAP`.
- `persistNotifications(dto)`: Writes notifications to PostgreSQL (`create` for single users; `createMany` for batches).
- `sendPushNotification(dto, preferencesMap)`: Filters by `pushEnabled`, queries active `Device` tokens, and calls `FcmProviderService`.
- `sendEmailNotification(dto, preferencesMap, ctx)`: Filters by `emailEnabled`, resolves email template mapping, and delegates to `EmailService`.
- `sendWhatsAppNotification(dto, preferencesMap)`: Filters by `whatsappEnabled` and delegates to `WhatsAppProviderService`.
- `awaitChannelDispatches(promises, ctx)`: Concurrently awaits all channel promises with `Promise.allSettled`.

---

## ✉️ Brevo Transactional Email Engine

### 1. Template Compilation & Layout Inheritance

All email templates reside under `src/modules/notifications/templates/` and inherit from a centralized, mobile-responsive base layout:

```
src/modules/notifications/templates/
├── layout.hbs                   # Responsive container, CSS reset, typography, header & footer slots
├── partials/
│   ├── header.hbs               # Brand logo, top spacing, webview links
│   └── footer.hbs               # Legal address, unsubscribe link, copyright year
└── [template-name].hbs          # Individual body templates
```

- **Startup Pre-Compilation**: During `EmailService.onModuleInit()`, Handlebars registers partials (`header`, `footer`) and pre-compiles `layout.hbs` and all template files into an in-memory `Map<EmailType, Handlebars.TemplateDelegate>`. Any malformed Handlebars syntax is caught during application boot, preventing runtime failures.
- **Custom Comparison Helpers**: The engine registers logical comparison helpers (`gt`, `gte`, `lt`, `lte`, `eq`) enabling dynamic pluralization and conditional styling:
  ```handlebars
  {{#if (gt creditsUsed 1)}}credits{{else}}credit{{/if}}
  ```

### 2. Envelope-Encrypted Email Resolution via Recipient Resolver

BreathAway enforces zero-plaintext storage of Personally Identifiable Information (PII). The `User` table contains no email column. Rather than performing database queries and KMS operations directly, `EmailService` delegates recipient identity and profile resolution to the dedicated `NotificationRecipientResolverService`:

1. `EmailService.send()` calls `this.recipientResolver.resolveEmails(userIds)`.
2. The resolver queries `AuthCredential` records (`type = AuthCredentialType.EMAIL`, `deletedAt IS NULL`) with fallback to verified `Identity` records.
3. Decrypts the attached envelope ciphertext via `IdentityCryptoService.decryptPublicValue()` (AES-256-GCM + Google Cloud KMS).
4. Returns a `Map<string, ResolvedEmailContact>` with trimmed lowercase emails and profile `firstName`.
5. `EmailService` deduplicates by recipient email address to avoid sending multiple identical emails to the same destination.

### 3. Provider Adapter (`BrevoEmailAdapter`)

The `BrevoEmailAdapter` implements `IEmailAdapter` and communicates with the Brevo v3 Transactional SMTP API (`POST https://api.brevo.com/v3/smtp/email`):

```typescript
{
  "sender": { "name": "BreathAway", "email": "notifications@breathaway.app" },
  "to": [{ "email": "recipient@example.com" }],
  "subject": "Personalized Subject Line",
  "htmlContent": "<!DOCTYPE html>..."
}
```

---

## 📲 Push Notifications & Multi-Platform FCM Delivery

BreathAway leverages Firebase Cloud Messaging (`FcmProviderService`) to broadcast push notifications across **iOS**, **Android**, and **Web Browsers (Web Push)**.

### Token Grouping & Platform-Specific Configurations

Device tokens associated with the recipient user are fetched from the `Device` table and segregated by `DevicePlatform`:

1. **iOS (`DevicePlatform.IOS`)**:
   - Dispatches via Apple Push Notification service (`apns`).
   - Configures `aps: { sound: 'default', badge: 1 }` and `category` headers.
2. **Android (`DevicePlatform.ANDROID`)**:
   - Dispatches via FCM Android block (`android`).
   - Configures `priority: 'high'`, `notification: { channelId: 'default', sound: 'default' }`.
3. **Web (`DevicePlatform.WEB`)**:
   - Dispatches via WebPush protocol block (`webpush`).
   - Configures browser notification display metadata:
     - `icon`: Configured via `WEBPUSH_ICON_URL` (defaulting to `${APP_URL}/icon-192x192.png`).
     - `badge`: Configured via `WEBPUSH_BADGE_URL` (defaulting to `${APP_URL}/badge-72x72.png`).
     - `fcmOptions: { link: resolveWebLink(...) }`: The fully-qualified HTTPS deep link the browser focuses or navigates to when the user clicks the notification.

### Deep Linking & Payload Normalization

Every outgoing push notification includes unified navigation metadata in its top-level `data` payload:

- `link`: Normalized route (e.g., `/matches/01HM...`, `/credits`).
- `route`: Alias for `link` for cross-client compatibility.

Relative links are resolved against the `APP_URL` environment variable:

- Absolute URLs (`https://...`) pass through unmodified.
- Relative routes (e.g., `/matches/:id`) are appended to `${APP_URL}/app${link}`.

> [!TIP]
> For a full client-side implementation guide (service workers, VAPID key setup, token synchronization, and foreground toast handling), consult the [Web Push Integration Guide](../api/web-push.md).

---

## 💬 WhatsApp Delivery Infrastructure (LiteApp Integration)

BreathAway integrates WhatsApp messaging to deliver real-time, high-visibility alerts (e.g. mutual matches and new account logins). Rather than connecting directly to Meta Cloud API during initial rollout, BreathAway routes messages through **LiteApp**, which hosts a shared WhatsApp business number.

### 1. Pluggable Transport Adapter Pattern

To isolate delivery mechanics and enable a zero-downtime transition to Meta's native Cloud API in the future, the provider adheres strictly to the Adapter Pattern:

```
src/modules/notifications/whatsapp/
├── adapters/
│   ├── whatsapp-adapter.interface.ts   # IWhatsAppAdapter contract & WHATSAPP_ADAPTER_TOKEN
│   └── liteapp.whatsapp.adapter.ts     # Concrete LiteApp HTTP client
└── whatsapp-template.registry.ts       # Meta approved template mappings
```

```typescript
export interface WhatsAppSendPayload {
  to: string; // Recipient phone number in E.164 digits without "+" (e.g. "919876543210")
  template: string; // Meta-approved template name
  language?: string; // Language code (default: 'en')
  params?: Record<string, unknown>; // Optional template variables
}

export interface IWhatsAppAdapter {
  send(payload: WhatsAppSendPayload): Promise<void>;
}
```

At runtime, `NotificationsModule` uses NestJS factory injection to bind `WHATSAPP_ADAPTER_TOKEN` based on the `WHATSAPP_PROVIDER` environment variable:

- When `WHATSAPP_PROVIDER === 'liteapp'` (default), `LiteAppWhatsAppAdapter` is injected.
- Future providers (e.g., native Meta Cloud API) implement `IWhatsAppAdapter` without touching `WhatsAppProviderService` or domain event logic.

### 2. LiteApp HTTP API Contract

The `LiteAppWhatsAppAdapter` communicates with LiteApp via standard JSON over HTTP:

- **Endpoint**: `POST ${LITEAPP_WHATSAPP_URL}/api/routes/plugins/whatsapp/send`
  - Development / Staging: `https://dev.liteapp.store`
  - Production: `https://liteapp.store`
- **Headers**:
  - `Authorization: Bearer ${LITEAPP_WHATSAPP_KEY}`
  - `Content-Type: application/json`
- **Payload Example**:
  ```json
  {
    "to": "919876543210",
    "template": "breathaway_new_match",
    "language": "en"
  }
  ```

### 3. Rate-Limiting & Backoff Retry Policy

To avoid duplicate notifications while maintaining resilience against upstream provider throttling, `LiteAppWhatsAppAdapter` enforces a strict response handling policy:

| Response Status                    | Action                             | Rationale                                                                                                                               |
| :--------------------------------- | :--------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **`200 OK`**                       | **Success — Never retry**          | Message successfully accepted by WhatsApp gateway. Retrying causes duplicate recipient messages.                                        |
| **`429 Too Many Requests`**        | **Retry Once after `Retry-After`** | Parses the upstream `Retry-After` header (in seconds, default: 2s) and retries the HTTP call exactly once.                              |
| **`4xx` / `5xx` / Network Errors** | **Log & Do Not Retry**             | Template errors, invalid destination numbers, or transient 500s are logged with structured context (`step: 'liteapp_dispatch_failed'`). |

### 4. Distributed Event Deduplication via Redis

To guarantee that a user never receives duplicate WhatsApp messages for the same business event (e.g., if a domain event re-fires or a Pub/Sub consumer retries a message), `WhatsAppProviderService` utilizes a distributed Redis deduplication lock with in-memory TTL map fallback:

- **Deduplication Key Pattern**:
  - Mutual Matches: `whatsapp:match:{matchId}:{userId}`
- **TTL Window**: `86,400 seconds` (24 hours / 1 day).
- **Atomic Acquisition**:
  ```typescript
  const result = await redisClient.set(key, '1', 'EX', 86400, 'NX');
  const isDuplicate = result !== 'OK';
  ```
- **Fallback**: If Redis is unavailable or unconfigured, an in-memory `Map<string, number>` tracks event dispatches with identical TTL pruning using `DateUtil.now()`.

### 5. Meta Template Registry Catalog

All WhatsApp templates must be approved by Meta before dispatch. Template configurations are declared in `WHATSAPP_TEMPLATE_MAP`:

| Event / Notification Type | Meta Template Name          | Target Recipients                                  | Language | Button / Deep Link                         | Description                                                                                                       |
| :------------------------ | :-------------------------- | :------------------------------------------------- | :------- | :----------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| `NEW_MATCH`               | `breathaway_new_match`      | **Both matched users** (`userOneId` & `userTwoId`) | `en`     | Opens `https://breathaway.app/app/matches` | "You have a new match on BreathAway! Someone you liked has liked you back. Tap below to see who it is and say hi" |
| `WELCOME`                 | `breathaway_new_user_login` | New account holder                                 | `en`     | Opens onboarding portal                    | Welcome alert upon initial verified login / registration                                                          |
| `LIKE_SENT`               | `breathaway_like_sent`      | Like sender                                        | `en`     | Deep link with `buttonUrlVariable`         | Confirmation that secret like was safely dispatched                                                               |

> [!IMPORTANT]
> **Mutual Match WhatsApp Policy**: When a match is created, the alert is sent concurrently to **both** `userOneId` and `userTwoId`. Neither user is excluded, ensuring immediate re-engagement on mobile channels.

---

## 🔐 Recipient Identity Resolution Architecture (NotificationRecipientResolverService)

BreathAway enforces end-to-end cryptographic envelope encryption for all sensitive user contact data (email addresses and phone numbers). The `User` database entity contains no plaintext or hashed contact fields.

To eliminate code duplication, enforce the Single Responsibility Principle (SRP), and shield delivery providers (`EmailService`, `WhatsAppProviderService`) from database queries and cryptographic internals, the resolution logic is encapsulated in `NotificationRecipientResolverService`.

### 1. Architectural Motivation & Decoupling

Prior to this architecture, individual channel providers independently queried `AuthCredential` and `Identity` tables, handled Prisma relation includes, and called `IdentityCryptoService.decryptPublicValue()`. This violated clean modular boundaries:

- **Leaky Abstractions**: Email and WhatsApp services were tightly coupled to database schema details (`AuthCredentialType`, `publicValueCiphertext`, `publicValueIv`, `publicValueTag`, etc.).
- **Code Duplication**: Phone standardization (E.164 parsing) and envelope decryption were implemented multiple times.
- **Resilience Friction**: A single corrupted credential could throw an exception and interrupt batch processing for other users.

With `NotificationRecipientResolverService`:

```
Domain Feature (e.g. EmailService, WhatsAppProviderService)
                │
                ▼ (Clean Interface: userIds[])
NotificationRecipientResolverService
  ├── PrismaService (AuthCredential & Identity queries)
  ├── IdentityCryptoService (AES-256-GCM + Google Cloud KMS)
  └── libphonenumber-js (ITU-T E.164 formatting & validation)
```

Both `EmailService` and `WhatsAppProviderService` are now lean consumers that receive strongly-typed, decrypted contacts without touching Prisma or cryptography.

### 2. Standardized Contact Contracts

The resolver outputs strongly-typed data contracts defined in `src/modules/notifications/recipient/interfaces/resolved-contact.interface.ts`:

```typescript
export interface ResolvedEmailContact {
  userId: string;
  email: string; // Trimmed, lowercased email address
  firstName?: string; // Recipient's display name from UserProfile
}

export interface ResolvedPhoneContact {
  userId: string;
  phoneDigits: string; // E.164 digits-only without "+" (e.g. "919876543210" for LiteApp/Meta)
  e164Formatted: string; // Full E.164 with "+" (e.g. "+919876543210")
  firstName?: string; // Recipient's display name from UserProfile
}
```

### 3. Resolution Hierarchy & Fallback Logic

When resolving contacts for an array of user IDs, the resolver executes a two-tier resolution strategy:

1. **Primary: `AuthCredential` Table**:
   - Queries active credentials (`type: EMAIL` or `type: PHONE`, `deletedAt: null`).
   - Includes user profile (`user.profile.firstName`) and linked `Identity` encryption envelope.
   - Decrypts `publicValueCiphertext` via `IdentityCryptoService.decryptPublicValue()`.
2. **Fallback: `Identity` Table**:
   - For any user IDs not resolved via `AuthCredential` (e.g., users who linked an additional verified identity), queries `Identity` records (`type: EMAIL` or `type: PHONE`, `isVerified: true`, `deletedAt: null`).
   - Ordered by `createdAt ASC` to select the primary verified contact method.
   - Decrypts ciphertext and populates contact records.

### 4. International Phone Normalization (ITU-T E.164)

WhatsApp gateways require strict ITU-T E.164 digits-only formatting (e.g., `919876543210` with country code, without spaces, dashes, or the leading `+`). The resolver utilizes `libphonenumber-js`:

- Trims raw decrypted phone strings.
- Validates international country calling codes and national number length.
- Standardizes into two formats:
  - `phoneDigits`: `${countryCallingCode}${nationalNumber}` (e.g., `919876543210`).
  - `e164Formatted`: `+${countryCallingCode}${nationalNumber}` (e.g., `+919876543210`).
- If library parsing fails on legacy records, falls back to regex digit sanitization (`\D` stripping) with minimum length verification ($\ge 7$ digits).

### 5. Resilient Error Isolation

If a single user's credential has corrupted ciphertext, an expired KMS data key, or an invalid phone number:

- The error is logged with structured context (`step: 'decrypt_email_credential'` or `'decrypt_phone_credential'`, `userId`, `serializeError`).
- The resolver does **not** throw. It skips the faulty user and continues resolving contacts for remaining users in the batch.
- Batch dispatches (such as mutual matches or credit purchase receipts) are never dropped due to a single bad record.

---

## 📊 Lifecycle Email Notifications Catalog

BreathAway supports **14 distinct email notifications** covering onboarding, social matching, credits and monetization, account security, and system events.

### Master Email Reference Matrix

| Notification Type / Email Type | Category     | Trigger Origin / Method                    | Primary Recipient  | Subject Line Template                                            | Template File               | Preference Key |
| :----------------------------- | :----------- | :----------------------------------------- | :----------------- | :--------------------------------------------------------------- | :-------------------------- | :------------- |
| `WELCOME`                      | Onboarding   | `AuthService.signup` / `signInOrSignUp`    | New user           | `Welcome to BreathAway, {{name}}! 🌬️`                            | `welcome.hbs`               | `emailEnabled` |
| `LIKE_SENT`                    | Social       | `LikesService.create`                      | Like sender        | `Your like has been sent! 💌`                                    | `like-sent.hbs`             | `emailEnabled` |
| `NEW_MATCH`                    | Social       | `MatchResolverService.resolveFromLike`     | Both matched users | `It's a Match, {{name}}! 💫`                                     | `new-match.hbs`             | `emailEnabled` |
| `LIKE_WITHDRAWN`               | Social       | `LikesService.delete`                      | Like sender        | `Like Withdrawn — BreathAway`                                    | `like-withdrawn.hbs`        | `emailEnabled` |
| `LIKES_EXPIRED`                | Maintenance  | `MaintenanceService.voidPendingLikes`      | Like sender        | `Update on your pending likes ⏳`                                | `likes-expired.hbs`         | `emailEnabled` |
| `CREDITS_PURCHASED`            | Monetization | `CreditsService.grantCredits`              | Purchasing user    | `Credits Purchase Confirmed! 💳`                                 | `credits-purchased.hbs`     | `emailEnabled` |
| `CREDITS_USED`                 | Monetization | `CreditsService.consumeCredits`            | Spending user      | `You used {{creditsUsed}} credit(s) on BreathAway ✨`            | `credits-used.hbs`          | `emailEnabled` |
| `BUNDLE_EXPIRY_WARNING`        | Maintenance  | `CreditsService.handleExpiryWarningBatch`  | Bundle holder      | `Urgent / Reminder: {{count}} credits expiring... ⏳`            | `bundle-expiry-warning.hbs` | `emailEnabled` |
| `CREDIT_UPDATE`                | Monetization | `CreditsService` / Admin                   | User               | `Your BreathAway credits have been updated`                      | `credit-update.hbs`         | `emailEnabled` |
| `IDENTITY_ADDED`               | Security     | `IdentitiesService.create` / `AuthService` | Account owner      | `Security Alert: New {{identityType}} added to your account 🔒`  | `identity-added.hbs`        | `emailEnabled` |
| `IDENTITY_REMOVED`             | Security     | `IdentitiesService.delete`                 | Account owner      | `Security Alert: {{identityType}} removed from your account 🔒`  | `identity-removed.hbs`      | `emailEnabled` |
| `DEVICE_ADDED`                 | Security     | `DevicesService.createDevice`              | Account owner      | `Security Alert: New device added to your BreathAway account 📱` | `device-added.hbs`          | `emailEnabled` |
| `NEW_MESSAGE`                  | Social       | `ChatsService.sendMessage`                 | Chat recipient     | `{{senderName}} sent you a message 💬`                           | `new-message.hbs`           | `emailEnabled` |
| `SYSTEM_ALERT`                 | System       | System workflows / Admin                   | User               | `{{alertTitle}} — BreathAway`                                    | `system-alert.hbs`          | `emailEnabled` |

---

## 🔍 Detailed Notification Specifications

### 1. Welcome Email (`WELCOME`)

Sent immediately when a user creates their account or links their first verified email address.

- **Trigger Point**:
  - `AuthService.signup()`: when a user completes standard registration.
  - `AuthService.signInOrSignUp()`: when a new user record is created via federated authentication.
  - `AuthService.addSecondaryAuth()`: when an existing user attaches and verifies a new `EMAIL` identity.
- **Template**: `welcome.hbs`
- **Subject**: `Welcome to BreathAway, {{name}}! 🌬️`
- **Payload Variables**:
  | Key | Type | Description |
  | :--- | :--- | :--- |
  | `name` | `string` | User's preferred first name |
  | `appUrl` | `string` | Base deep-link or web app URL |
  | `ctaUrl` | `string` | Onboarding profile completion link |

> [!NOTE]
> When `addSecondaryAuth()` links an email address, both the `WELCOME` onboarding email and an `IDENTITY_ADDED` security alert are dispatched so the user verifies delivery and is notified of the account credential modification.

---

### 2. Like Sent Confirmation (`LIKE_SENT`)

Sent to the sender confirming that their like has been securely recorded and reassuring them of double-blind confidentiality.

- **Trigger Point**: `LikesService.create()`
- **Template**: `like-sent.hbs`
- **Subject**: `Your like has been sent! 💌`
- **Payload Variables**:
  | Key | Type | Description |
  | :--- | :--- | :--- |
  | `name` | `string` | Sender's first name |
  | `targetMaskedValue` | `string` | Masked phone number (e.g. `+1 ••• ••• 4589`) or handle |
  | `targetLabel` | `string` _(optional)_ | Contact nickname or label chosen by sender |
  | `intent` | `string` | Like intent (e.g., `CRUSH`, `DATING`, `NETWORKING`) |
  | `expiresAt` | `string` | Formatted expiration date string (e.g., 90 days out) |
  | `date` | `string` | ISO timestamp of the like creation (`DateUtil.now()`) |

> [!IMPORTANT]
> **Double-Blind Privacy**: The target recipient is **never** sent an email or told who liked them. Only the sender receives this confirmation.

---

### 3. Mutual Match Alert (`NEW_MATCH`)

Sent concurrently to both users when a mutual like is resolved, establishing a match.

- **Trigger Point**: `MatchResolverService.resolveFromLike()`
- **Template**: `new-match.hbs`
- **Subject**: `It's a Match, {{name}}! 💫`
- **Payload Variables**:
  | Key | Type | Description |
  | :--- | :--- | :--- |
  | `name` | `string` | Recipient user's first name |
  | `matchName` | `string` | Matched partner's first name |
  | `matchAvatarUrl` | `string` _(optional)_ | Public avatar image URL of the matched partner |
  | `matchId` | `string` | ULID identifier of the created `Match` |
  | `chatUrl` | `string` | Deep link directly into the newly created chat room |
  | `date` | `string` | ISO timestamp of match creation |

---

### 4. Like Withdrawn (`LIKE_WITHDRAWN`)

Sent to the user when they delete or cancel a pending, unreciprocated like.

- **Trigger Point**: `LikesService.delete()`
- **Template**: `like-withdrawn.hbs`
- **Subject**: `Like Withdrawn — BreathAway`
- **Payload Variables**:
  | Key | Type | Description |
  | :--- | :--- | :--- |
  | `name` | `string` | User's first name |
  | `targetMaskedValue` | `string` | Masked phone number or identifier of the target |
  | `targetLabel` | `string` _(optional)_ | Custom nickname originally given to the target |
  | `withdrawnAt` | `string` | Formatted timestamp of withdrawal (`DateUtil.now()`) |

---

### 5. Likes Expired Clean-Up (`LIKES_EXPIRED`)

Sent by the nightly maintenance worker when unreciprocated pending likes surpass the 90-day retention window and are transitioned to `EXPIRED`.

- **Trigger Point**: `MaintenanceService.voidPendingLikes()`
- **Template**: `likes-expired.hbs`
- **Subject**: `Update on your pending likes ⏳`
- **Payload Variables**:
  | Key | Type | Description |
  | :--- | :--- | :--- |
  | `name` | `string` | User's first name |
  | `count` | `number` | Number of likes that expired in the batch |
  | `expiryDate` | `string` | Date on which the batch was voided |
  | `date` | `string` | ISO timestamp of the cron execution |

---

### 6. Credits Purchased Receipt (`CREDITS_PURCHASED`)

Sent to the user upon a successful credit bundle purchase, subscription renewal, or promo credit grant.

- **Trigger Point**: `CreditsService.grantCredits()`
- **Template**: `credits-purchased.hbs`
- **Subject**: `Credits Purchase Confirmed! 💳`
- **Payload Variables**:
  | Key | Type | Description |
  | :--- | :--- | :--- |
  | `name` | `string` | User's first name |
  | `creditsAdded` | `number` | Quantity of credits granted |
  | `creditBalance` | `number` | Real-time derived total balance after addition |
  | `transactionId` | `string` | Ledger entry reference ID or invoice identifier |
  | `expiresAt` | `string` _(optional)_ | Formatted expiration date for time-limited bundles |
  | `bundleType` | `string` | Source label (`PURCHASE`, `SUBSCRIPTION`, `BONUS`) |

---

### 7. Credits Used Notification (`CREDITS_USED`)

Sent to the user whenever credits are debited from their ledger (e.g. sending a paid like or unlocking a connection).

- **Trigger Point**: `CreditsService.consumeCredits()`
- **Template**: `credits-used.hbs`
- **Subject**: `You used {{creditsUsed}} {{#if (gt creditsUsed 1)}}credits{{else}}credit{{/if}} on BreathAway ✨`
- **Payload Variables**:
  | Key | Type | Description |
  | :--- | :--- | :--- |
  | `name` | `string` | User's first name |
  | `creditsUsed` | `number` | Number of credits debited in this transaction |
  | `creditBalance` | `number` | Remaining real-time credit balance |
  | `usedAt` | `string` | Formatted timestamp of consumption |
  | `reason` | `string` | Credit source reason (`LIKE_USAGE`, `ADMIN`) |

---

### 8. Credit Bundle Expiry Warning (`BUNDLE_EXPIRY_WARNING`)

Sent proactively to users who have expiring credit bundles within the warning threshold (7 days for info, 2 days for urgent notice).

- **Trigger Point**: `CreditsService.handleExpiryWarningBatch()` (via maintenance cron)
- **Template**: `bundle-expiry-warning.hbs`
- **Subject**: `{{#if isUrgent}}Urgent: {{count}} credits expiring soon! ⏳{{else}}Reminder: {{count}} credits expiring on {{expiryDate}} ⏳{{/if}}`
- **Payload Variables**:
  | Key | Type | Description |
  | :--- | :--- | :--- |
  | `name` | `string` | User's first name |
  | `count` | `number` | Total quantity of credits expiring across the affected bundles |
  | `expiryDate` | `string` | Earliest expiration date string |
  | `daysRemaining` | `number` | Days remaining until expiration |
  | `urgency` | `'warning' \| 'info'` | Urgency classification |
  | `isUrgent` | `boolean` | `true` if `daysRemaining <= 2` |

---

### 9. Identity Added Security Alert (`IDENTITY_ADDED`)

Sent whenever a new contact method (email, phone, Instagram handle) is attached to a user's account.

- **Trigger Point**: `IdentitiesService.create()`, `AuthService.addSecondaryAuth()`
- **Template**: `identity-added.hbs`
- **Subject**: `Security Alert: New {{identityType}} added to your account 🔒`
- **Payload Variables**:
  | Key | Type | Description |
  | :--- | :--- | :--- |
  | `name` | `string` | Account holder's first name |
  | `identityType` | `string` | Human-readable identity type (`Email`, `Phone`, `Instagram`) |
  | `maskedValue` | `string` | Masked contact identifier (e.g. `j•••••@example.com`, `+1 ••• ••• 1234`) |
  | `addedAt` | `string` | Formatted timestamp of identity attachment |
  | `isVerified` | `boolean` | Whether identity was pre-verified |

> [!WARNING]
> Security notifications include direct action buttons linking to `/settings/security` so users can immediately lock compromised accounts if they did not initiate the action.

---

### 10. Identity Removed Security Alert (`IDENTITY_REMOVED`)

Sent when an existing identity method is unlinked or deleted from an account.

- **Trigger Point**: `IdentitiesService.delete()`
- **Template**: `identity-removed.hbs`
- **Subject**: `Security Alert: {{identityType}} removed from your account 🔒`
- **Payload Variables**:
  | Key | Type | Description |
  | :--- | :--- | :--- |
  | `name` | `string` | Account holder's first name |
  | `identityType` | `string` | Type of identity removed |
  | `maskedValue` | `string` | Masked identifier that was deleted |
  | `removedAt` | `string` | Formatted timestamp of deletion |

---

### 11. New Device Added Alert (`DEVICE_ADDED`)

Sent when a new physical or web device registers an active push notification token for the account.

- **Trigger Point**: `DevicesService.createDevice()`
- **Template**: `device-added.hbs`
- **Subject**: `Security Alert: New device added to your BreathAway account 📱`
- **Payload Variables**:
  | Key | Type | Description |
  | :--- | :--- | :--- |
  | `name` | `string` | Account holder's first name |
  | `platform` | `string` | Platform identifier (`IOS`, `ANDROID`, `WEB`) |
  | `deviceId` | `string` | Masked or truncated device ID/model |
  | `appVersion` | `string` | Client app build version (e.g., `1.4.2`) |
  | `addedAt` | `string` | Formatted timestamp of device registration |

---

## ⚡ Reliability & Decoupled Event Pattern

### Decoupled Domain Events via `@nestjs/event-emitter`

To maintain sub-100ms API response times, decouple feature domains, and prevent transactional bloat, domain services **never directly call `NotificationsService.dispatch`** or import `NotificationsModule`.

Instead, domain services extend `BaseService` and emit strongly typed domain events synchronously. All notification orchestration, channel selection, priority mapping, and recipient profile resolution are isolated within `NotificationEventsListener`.

```typescript
// 1. Domain Service (e.g. LikesService) — Only emits domain events
async create(userId: string, dto: CreateLikeRequestDto): Promise<LikeResponseDto> {
  const targetIdentity = await this.identitiesService.findOne(...);
  const like = await this.prisma.like.create(...);

  // Synchronous domain event emission (runs listeners asynchronously)
  this.eventEmitter.emit(
    LIKE_SENT_EVENT,
    new LikeSentEvent(
      userId,
      targetIdentity.publicValueMasked ?? '',
      dto.targetLabel ?? null,
      like.intent,
      like.expiresAt,
    ),
  );

  return this.mapToResponse(like);
}
```

```typescript
// 2. NotificationEventsListener (src/modules/notifications/listeners/)
@OnEvent(LIKE_SENT_EVENT, { async: true })
async handleLikeSent(event: LikeSentEvent): Promise<void> {
  try {
    const firstName = await this.resolveUserFirstName(event.userId);

    await this.notificationsService.dispatch({
      type: NotificationType.LIKE_SENT,
      category: NotificationCategory.SOCIAL,
      priority: NotificationPriority.NORMAL,
      channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
      userIds: [event.userId],
      payload: {
        name: firstName ?? 'there',
        targetMaskedValue: event.targetMaskedValue,
        targetLabel: event.targetLabel,
        intent: event.intent,
        expiresAt: event.expiresAt ? DateUtil.formatDate(event.expiresAt) : '',
        date: DateUtil.now().toISOString(),
      },
    });
  } catch (error) {
    this.logger.error('Failed to dispatch like sent notification', {
      userId: event.userId,
      err: serializeError(error),
    });
  }
}
```

### Key Engineering Rules

1. **Zero Direct Coupling**: Domain services (`Auth`, `Likes`, `Matches`, `Credits`, etc.) must **never** import `NotificationsModule` or inject `NotificationsService`.
2. **Zero Profile Pre-fetching**: Domain services do not query `userProfile` solely to extract `firstName` for notifications. `NotificationEventsListener` resolves profile data as needed.
3. **Fallback Name Auto-Resolution**: If a notification request omits `payload.name` for a single recipient, `NotificationsService.processSendRequest` automatically fetches `userProfile.firstName` before dispatching to provider networks.
4. **Asynchronous Execution**: Handlers in `NotificationEventsListener` configure `@OnEvent(EVENT_NAME, { async: true })`, ensuring notification formatting runs completely outside the client's HTTP request lifecycle.
5. **Resilient Provider Failure**: In `NotificationsService.processSendRequest()`, downstream provider dispatches run in `Promise.allSettled()`. A failure in Brevo email delivery never prevents FCM push or WhatsApp delivery.
6. **Detailed Architecture Guide**: See [Decoupled Domain Events Architecture](../architecture/domain-events.md) for full event catalog and scaffolding blueprints.

---

## ⚙️ Configuration & Environment Variables

| Variable                     | Type   | Description                                                          | Example                                               |
| :--------------------------- | :----- | :------------------------------------------------------------------- | :---------------------------------------------------- |
| `BREVO_API_KEY`              | String | Secret API key for Brevo transactional email v3 API (Secret Manager) | `xkeysib-••••••••••••`                                |
| `EMAIL_FROM_ADDRESS`         | String | Verified sender address configured in Brevo                          | `no-reply@breathaway.app`                             |
| `EMAIL_FROM_NAME`            | String | Display name for outgoing system emails                              | `BreathAway`                                          |
| `WHATSAPP_PROVIDER`          | String | Active WhatsApp delivery provider (`liteapp` \| `meta`)              | `liteapp`                                             |
| `LITEAPP_WHATSAPP_URL`       | String | Base URL for LiteApp WhatsApp HTTP gateway                           | `https://dev.liteapp.store` / `https://liteapp.store` |
| `LITEAPP_WHATSAPP_KEY`       | String | Secret API key for LiteApp gateway authorization (Secret Manager)    | `Bearer la_sec_••••••••`                              |
| `REDIS_URL`                  | String | Optional Redis connection string for distributed 24h deduplication   | `redis://default:••••@10.0.0.5:6379`                  |
| `APP_URL`                    | String | Base frontend or universal deep-link URL                             | `https://app.breathaway.app`                          |
| `WEBPUSH_ICON_URL`           | String | Web push notification icon asset URL                                 | `https://app.breathaway.app/icon-192x192.png`         |
| `WEBPUSH_BADGE_URL`          | String | Web push monochrome badge asset URL                                  | `https://app.breathaway.app/badge-72x72.png`          |
| `PUBSUB_NOTIFICATIONS_TOPIC` | String | GCP Pub/Sub topic for async notification queue                       | `notifications-stream`                                |

> [!CAUTION]
> In production environments (Cloud Run), `BREVO_API_KEY` and `LITEAPP_WHATSAPP_KEY` must be mounted from **Google Cloud Secret Manager**. Never hardcode API keys or commit them to source control. Ensure cross-layer synchronization across `GcpSecretName`, `terraform/secrets.tf`, and `scripts/common.secrets.sh`.

---

## 🧪 Testing & Verification

### Unit Testing Providers & In-App Workflows

- **`NotificationRecipientResolverService`**: Tests identity decryption, AuthCredential resolution, verified Identity fallbacks, phone normalization (E.164 digits-only & standard), and resilient error handling for individual decryption failures.
  - File: `src/modules/notifications/tests/recipient/notification-recipient-resolver.service.spec.ts`
- **`LiteAppWhatsAppAdapter`**: Tests missing key/phone validations, successful 200 non-retry sends, HTTP 429 rate limit backoff retry honoring `Retry-After`, and non-retry error handling.
  - File: `src/modules/notifications/tests/whatsapp/liteapp.whatsapp.adapter.spec.ts`
- **`WhatsAppProviderService`**: Tests phone resolution delegation to `NotificationRecipientResolverService`, Redis 24h deduplication lock, and fault-isolated error handling.
  - File: `src/modules/notifications/tests/providers/whatsapp.provider.service.spec.ts`
- **`EmailService`**: Tests delegation to `NotificationRecipientResolverService`, Handlebars template compilation, partial registration, batch personalized rendering, and email deduplication.
  - File: `src/modules/notifications/tests/email.service.spec.ts`
- **`NotificationsController`**: Tests user-scoped queries, pagination cursors, unread badge counters, and idempotent read/dismiss mutations.
  - File: `src/modules/notifications/tests/notifications.controller.spec.ts`
- **`NotificationsAdminController`**: Tests admin HTTP Basic Auth guard enforcement and payload dispatch to Pub/Sub.
  - File: `src/modules/notifications/tests/notifications-admin.controller.spec.ts`
- **`NotificationsService`**: Tests selective push persistence, fallback name resolution, provider fan-out with `Promise.allSettled`, and inbox pagination.
  - File: `src/modules/notifications/tests/notifications.service.spec.ts`
- **`BrevoEmailAdapter`**: Tested with mocked `axios.post` calls to verify payload serialization, authentication headers (`api-key`), timeout configurations, and error handling.
  - File: `src/modules/notifications/tests/brevo.email.adapter.spec.ts`
- **Full Test Suite Execution**:
  ```bash
  npm test src/modules/notifications
  ```

### Manual Verification via Postman / Swagger

To trigger and verify notifications in staging:

1. Send an authenticated request to `GET /api/v1/notifications/unread-count` with user JWT.
2. Trigger a mutual match between two test accounts (e.g. `POST /api/v1/likes`).
3. Re-query `GET /api/v1/notifications/unread-count` to verify badge increment for both users.
4. Verify that WhatsApp messages are received on both test phone numbers with the `breathaway_new_match` template.
5. Fetch inbox items via `GET /api/v1/notifications` and verify the newly stored notification payload.
6. Mark the item as read via `PATCH /api/v1/notifications/:id/read` and verify `isRead: true` and `readAt` timestamp.
7. Verify email delivery in the Brevo Transactional Email dashboard.
