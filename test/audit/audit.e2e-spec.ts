import { AppTestContext, createAuthTestApp } from '../helpers/app-test.helper';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { AUDIT_LOG_EVENT } from '@modules/audit/constants/audit.constants';
import { AuditActionType } from '@modules/audit/dto';
import { PubSubEvent } from '@modules/pubsub/enums/pubsub-events.enum';
import { AuditModule } from '@modules/audit/audit.module';

describe('AuditModule (e2e)', () => {
  let context: AppTestContext;
  let eventEmitter: EventEmitter2;
  let pubSubPublisher: PubSubPublisherService;

  beforeAll(async () => {
    // Include AuditModule in the bootstrapped application
    context = await createAuthTestApp([AuditModule]);
    eventEmitter = context.app.get(EventEmitter2);
    pubSubPublisher = context.app.get(PubSubPublisherService);
  });

  afterAll(async () => {
    await context.app.close();
  });

  it('should receive internal AUDIT_LOG_EVENT and publish to PubSub', async () => {
    // Spy on the real PubSubPublisherService
    const publishSpy = jest
      .spyOn(pubSubPublisher, 'publish')
      .mockResolvedValue('mock-msg-id');

    const payload = {
      actionType: AuditActionType.USER_LOGIN,
      userId: 'test-user-e2e',
      ipAddress: '127.0.0.1',
      metadata: { browser: 'Chrome' },
    };

    // Emit the internal event
    eventEmitter.emit(AUDIT_LOG_EVENT, payload);

    // Give the event loop a tick for asynchronous event handlers to run
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(publishSpy).toHaveBeenCalledWith(
      expect.any(String), // Topic name from config
      PubSubEvent.SYSTEM_AUDIT_LOG,
      payload,
      { actionType: AuditActionType.USER_LOGIN },
    );

    publishSpy.mockRestore();
  });
});
