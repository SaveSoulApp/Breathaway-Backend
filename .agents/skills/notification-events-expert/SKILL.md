---
name: notification-events-expert
description: >
  Use this skill whenever building, modifying, or reviewing notification triggers,
  domain events, or cross-service communication in the NestJS backend.
  Trigger on: "send notification", "notify user", "dispatch notification", "notification",
  "domain event", "EventEmitter2", "NotificationEventsListener", "NotificationType",
  "email notification", "push notification", "in-app notification", "emit event",
  "OnEvent", or whenever a business action requires notifying a user (e.g. signup, purchase,
  match, like, verification, device registration). Enforces complete decoupling of domain
  services from NotificationsModule via strongly typed domain events.
---

# Notification Events & Decoupling Expert

You are a Senior NestJS Engineer responsible for maintaining clean modular architecture in this backend. This skill defines how notifications are triggered in this codebase.

## The Core Rule: Complete Decoupling

Domain feature modules (`Auth`, `Likes`, `Matches`, `Credits`, `Devices`, `Identities`, `Maintenance`, etc.) **must never** import `NotificationsModule` or inject `NotificationsService`.

Instead:

1. **Domain Services** perform business logic and publish **strongly typed domain events** using NestJS `EventEmitter2` (inherited via `BaseService`).
2. **`NotificationEventsListener`** (inside `NotificationsModule`) listens to these events via `@OnEvent(EVENT_CONSTANT, { async: true })`, resolves user profile data, determines delivery channels/priorities, and calls `NotificationsService.dispatch`.
3. **`NotificationsService`** provides fallback recipient auto-resolution (fetching `userProfile.firstName` if omitted for single-recipient notifications).

---

## Architecture Flow

```
[Domain Service]
       │
       │ (1) this.eventEmitter.emit(EVENT_NAME, new DomainEvent(...))
       ▼
[EventEmitter2 (In-Memory Pub/Sub)]
       │
       │ (2) @OnEvent(EVENT_NAME, { async: true })
       ▼
[NotificationEventsListener] (src/modules/notifications/listeners/)
       │
       │ (3) resolveUserFirstName(userId) [if needed]
       │ (4) notificationsService.dispatch({ channels, priority, type, payload })
       ▼
[NotificationsService]
       │
       │ (5) Push (FCM) / Email (Brevo) / In-App
       ▼
   Recipient
```

---

## When Adding a New Notification

Follow this 4-step workflow:

### Step 1: Define the Domain Event

In the domain module's `events/` folder:

- Create `src/modules/<feature>/events/<event-name>.event.ts`:
  - Export a constant event name: `export const USER_REGISTERED_EVENT = 'user.registered';`
  - Export a typed class containing only domain state (IDs, counts, timestamps):
    ```typescript
    export class UserRegisteredEvent {
      constructor(
        public readonly userId: string,
        public readonly registeredAt: Date = new Date(),
      ) {}
    }
    ```
- Export the event and constant in `src/modules/<feature>/events/index.ts` (barrel file).

### Step 2: Emit the Event in the Domain Service

- Ensure the service extends `BaseService` (which provides `protected readonly eventEmitter: EventEmitter2`).
- Emit the event upon successful completion of the business operation:
  ```typescript
  this.eventEmitter.emit(
    USER_REGISTERED_EVENT,
    new UserRegisteredEvent(user.id),
  );
  ```
- **Do not** query `userProfile` in the service to extract `firstName` for notifications.
- **Do not** wrap the emission in a try/catch or `.catch()` block; event handlers configured with `{ async: true }` run asynchronously and isolate errors.

### Step 3: Add an `@OnEvent` Handler in `NotificationEventsListener`

In `src/modules/notifications/listeners/notification-events.listener.ts`:

- Import the event and constant from the domain module:
  ```typescript
  import {
    USER_REGISTERED_EVENT,
    UserRegisteredEvent,
  } from '@modules/users/events';
  ```
- Add the async listener method:
  ```typescript
  @OnEvent(USER_REGISTERED_EVENT, { async: true })
  async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
    try {
      const firstName = await this.resolveUserFirstName(event.userId);
      await this.notificationsService.dispatch({
        type: NotificationType.WELCOME,
        category: NotificationCategory.TRANSACTIONAL,
        priority: NotificationPriority.HIGH,
        channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
        userIds: [event.userId],
        payload: {
          name: firstName ?? 'there',
        },
      });
    } catch (error) {
      this.logger.error('Failed to dispatch user registered notification', {
        userId: event.userId,
        err: serializeError(error),
      });
    }
  }
  ```

### Step 4: Write Unit Tests

- **Domain Service Test**:
  - Provide `{ provide: EventEmitter2, useValue: { emit: jest.fn() } }`.
  - Assert `expect(eventEmitter.emit).toHaveBeenCalledWith(USER_REGISTERED_EVENT, expect.objectContaining({ ... }));`.
- **Listener Test**:
  - In `src/modules/notifications/tests/notification-events.listener.spec.ts`:
  - Call `listener.handleUserRegistered(mockEvent)`.
  - Assert `expect(notificationsService.dispatch).toHaveBeenCalledWith(...)`.

---

## Detailed References

- [`references/patterns.md`](./references/patterns.md) — Complete code examples, imports, and scaffolding templates.
- [`references/anti-patterns.md`](./references/anti-patterns.md) — List of anti-patterns and code review rejections.
