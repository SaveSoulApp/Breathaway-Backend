# Notification Anti-Patterns & Code Review Checklist

Review this document to identify and avoid common notification anti-patterns in pull requests and new code.

---

## Common Anti-Patterns

### ❌ Anti-Pattern 1: Injecting `NotificationsService` in Domain Services

```typescript
// ❌ WRONG: Leaks notification channel concerns into the domain service
@Injectable()
export class LikesService extends BaseService {
  constructor(
    private readonly notificationsService: NotificationsService, // BAD!
  ) {}

  async create(...) {
    // ...
    await this.notificationsService.dispatch(...);
  }
}
```

```typescript
// ✅ CORRECT: Emit a domain event. The service only cares that the domain action happened.
@Injectable()
export class LikesService extends BaseService {
  async create(...) {
    // ...
    this.eventEmitter.emit(LIKE_SENT_EVENT, new LikeSentEvent(...));
  }
}
```

---

### ❌ Anti-Pattern 2: Importing `NotificationsModule` in Feature Modules

```typescript
// ❌ WRONG: Creates tight coupling between feature modules and notifications
@Module({
  imports: [NotificationsModule], // BAD!
  providers: [CreditsService],
})
export class CreditsModule {}
```

```typescript
// ✅ CORRECT: No module coupling needed. BaseService provides EventEmitter2.
@Module({
  imports: [], // NotificationsModule is NOT imported
  providers: [CreditsService],
})
export class CreditsModule {}
```

---

### ❌ Anti-Pattern 3: Pre-fetching User Profiles in Business Logic for Notifications

```typescript
// ❌ WRONG: Pollutes business transactions with extra queries just for notifications
async grantCredits(...) {
  const user = await this.prisma.userProfile.findUnique({ where: { userId } }); // BAD!
  // ...
  this.dispatchNotification(user.firstName);
}
```

```typescript
// ✅ CORRECT: Pass domain identifiers only. Let NotificationEventsListener or NotificationsService resolve profile data.
async grantCredits(...) {
  // ...
  this.eventEmitter.emit(CREDITS_PURCHASED_EVENT, new CreditsPurchasedEvent(userId, amount, balance));
}
```

---

### ❌ Anti-Pattern 4: Inline Fire-and-Forget `.catch()` Handlers in Services

```typescript
// ❌ WRONG: Repetitive, boilerplate error handling across services
void this.notificationsService
  .dispatch(...)
  .catch((err) => this.logger.error(...)); // BAD!
```

```typescript
// ✅ CORRECT: Handled centrally in NotificationEventsListener with @OnEvent({ async: true }).
// The service simply calls this.eventEmitter.emit().
```

---

### ❌ Anti-Pattern 5: String Literals Instead of Event Constants

```typescript
// ❌ WRONG: Fragile string literal
this.eventEmitter.emit('user.registered', { userId }); // BAD!
```

```typescript
// ✅ CORRECT: Strongly typed class and exported constant
this.eventEmitter.emit(USER_REGISTERED_EVENT, new UserRegisteredEvent(userId));
```

---

## Code Review Checklist

When reviewing code that triggers or touches notifications, verify:

- [ ] Does any domain service import `NotificationsService` or `NotificationsModule`? **If yes, REJECT.**
- [ ] Is there an `@OnEvent` listener in `NotificationEventsListener` for this event?
- [ ] Is the event class strongly typed and exported from `src/modules/<feature>/events/index.ts`?
- [ ] Are all notification channels (`EMAIL`, `PUSH`, `IN_APP`) configured in `NotificationEventsListener`, NOT the domain service?
- [ ] Does the service test mock `EventEmitter2` and assert `eventEmitter.emit`?
- [ ] Does the listener have a unit test asserting `notificationsService.dispatch`?
