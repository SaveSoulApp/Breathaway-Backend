# Notification Events Implementation Patterns

This guide provides exact code snippets and templates for implementing decoupled notification events in the Breathaway backend.

---

## 1. Domain Event Template

### File Location

`src/modules/<feature>/events/<entity>-<action>.event.ts`

### Naming Conventions

- Event constant: `<ENTITY>_<ACTION>_EVENT = '<entity>.<action>'`
- Class name: `<Entity><Action>Event`

```typescript
// src/modules/subscriptions/events/subscription-renewed.event.ts
export const SUBSCRIPTION_RENEWED_EVENT = 'subscription.renewed';

export class SubscriptionRenewedEvent {
  constructor(
    public readonly userId: string,
    public readonly planId: string,
    public readonly renewalDate: Date,
    public readonly nextBillingDate: Date,
  ) {}
}
```

### Barrel Export

Always re-export from `src/modules/<feature>/events/index.ts`:

```typescript
// src/modules/subscriptions/events/index.ts
export * from './subscription-renewed.event';
```

---

## 2. Emitting in a Domain Service

Services extending `BaseService` inherit `this.eventEmitter: EventEmitter2`.

```typescript
// src/modules/subscriptions/subscriptions.service.ts
import { Injectable } from '@nestjs/common';
import { BaseService } from '@shared/domain/base.service';
import { SUBSCRIPTION_RENEWED_EVENT, SubscriptionRenewedEvent } from './events';

@Injectable()
export class SubscriptionsService extends BaseService {
  async renewSubscription(
    userId: string,
    planId: string,
  ): Promise<SubscriptionResponseDto> {
    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: { status: 'ACTIVE' },
    });

    // Clean, synchronous event emission
    this.eventEmitter.emit(
      SUBSCRIPTION_RENEWED_EVENT,
      new SubscriptionRenewedEvent(
        userId,
        planId,
        updated.renewalDate,
        updated.nextBillingDate,
      ),
    );

    return this.toResponse(updated);
  }
}
```

> [!NOTE]
> Do NOT inject `NotificationsService`. Do NOT query `this.prisma.userProfile.findUnique` to fetch `firstName` or details for notifications.

---

## 3. Handling in `NotificationEventsListener`

All event-to-notification mapping is centralized in `src/modules/notifications/listeners/notification-events.listener.ts`.

```typescript
// src/modules/notifications/listeners/notification-events.listener.ts
import { OnEvent } from '@nestjs/event-emitter';
import {
  SUBSCRIPTION_RENEWED_EVENT,
  SubscriptionRenewedEvent,
} from '@modules/subscriptions/events';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  NotificationType,
} from '../enums';

@Injectable()
export class NotificationEventsListener {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  @OnEvent(SUBSCRIPTION_RENEWED_EVENT, { async: true })
  async handleSubscriptionRenewed(
    event: SubscriptionRenewedEvent,
  ): Promise<void> {
    try {
      const firstName = await this.resolveUserFirstName(event.userId);

      await this.notificationsService.dispatch({
        type: NotificationType.SUBSCRIPTION_RENEWED,
        category: NotificationCategory.TRANSACTIONAL,
        priority: NotificationPriority.HIGH,
        channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
        userIds: [event.userId],
        payload: {
          name: firstName ?? 'there',
          planId: event.planId,
          renewalDate: event.renewalDate.toISOString(),
          nextBillingDate: event.nextBillingDate.toISOString(),
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to dispatch subscription renewed notification',
        {
          userId: event.userId,
          planId: event.planId,
          err: serializeError(error),
        },
      );
    }
  }

  /**
   * Helper to resolve firstName from userProfile
   */
  private async resolveUserFirstName(userId: string): Promise<string | null> {
    try {
      const profile = await this.prisma.userProfile.findUnique({
        where: { userId },
        select: { firstName: true },
      });
      return profile?.firstName ?? null;
    } catch {
      return null;
    }
  }
}
```

---

## 4. Unit Testing

### Domain Service Test

Ensure `EventEmitter2` is provided with an `emit` jest spy. Verify the event and payload are emitted.

```typescript
// src/modules/subscriptions/tests/subscriptions.service.spec.ts
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SUBSCRIPTION_RENEWED_EVENT } from '../events';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    eventEmitter = { emit: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: EventEmitter2, useValue: eventEmitter },
        // ... other providers, NO NotificationsService!
      ],
    }).compile();

    service = module.get(SubscriptionsService);
  });

  it('should emit SUBSCRIPTION_RENEWED_EVENT upon renewal', async () => {
    await service.renewSubscription('user-1', 'plan-premium');

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      SUBSCRIPTION_RENEWED_EVENT,
      expect.objectContaining({
        userId: 'user-1',
        planId: 'plan-premium',
      }),
    );
  });
});
```

### Notification Listener Test

Test the event handler directly in `src/modules/notifications/tests/notification-events.listener.spec.ts`:

```typescript
describe('handleSubscriptionRenewed', () => {
  it('should resolve user name and dispatch notification', async () => {
    prisma.userProfile.findUnique.mockResolvedValueOnce({
      firstName: 'Alex',
    } as never);

    const event = new SubscriptionRenewedEvent(
      'user-1',
      'plan-premium',
      new Date('2026-09-01'),
      new Date('2026-10-01'),
    );

    await listener.handleSubscriptionRenewed(event);

    expect(notificationsService.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.SUBSCRIPTION_RENEWED,
        userIds: ['user-1'],
        payload: expect.objectContaining({
          name: 'Alex',
          planId: 'plan-premium',
        }),
      }),
    );
  });
});
```
