import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  PubSubMessageDto,
  PubSubPushRequestDto,
} from '../dto/request/pubsub-push.request.dto';

describe('PubSubPushRequestDto', () => {
  it('should validate a valid pubsub push payload', async () => {
    const raw = {
      message: {
        data: Buffer.from('test data').toString('base64'),
        messageId: 'msg-123',
        publishTime: '2024-01-01T00:00:00.000Z',
        attributes: { eventType: 'USER_REGISTERED' },
      },
      subscription: 'projects/test/subscriptions/sub-1',
      deliveryAttempt: 1,
    };

    const dto = plainToInstance(PubSubPushRequestDto, raw);
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.message).toBeInstanceOf(PubSubMessageDto);
    expect(dto.message.messageId).toBe('msg-123');
    expect(dto.subscription).toBe('projects/test/subscriptions/sub-1');
    expect(dto.deliveryAttempt).toBe(1);
  });

  it('should fail validation if message is missing or invalid', async () => {
    const raw = {
      subscription: 'sub-1',
    };

    const dto = plainToInstance(PubSubPushRequestDto, raw);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('message');
  });

  it('should fail validation if messageId in message is empty', async () => {
    const raw = {
      message: {
        messageId: '',
        data: 'aGVsbG8=',
      },
    };

    const dto = plainToInstance(PubSubPushRequestDto, raw);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    const messageError = errors.find((e) => e.property === 'message');
    expect(messageError).toBeDefined();
    expect(
      messageError?.children?.some((c) => c.property === 'messageId'),
    ).toBe(true);
  });

  it('should accept alternate keys message_id and publish_time', async () => {
    const raw = {
      message: {
        messageId: 'msg-alt-1',
        message_id: 'msg-alt-1',
        publish_time: '2024-01-01T00:00:00.000Z',
      },
    };

    const dto = plainToInstance(PubSubPushRequestDto, raw);
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.message.message_id).toBe('msg-alt-1');
    expect(dto.message.publish_time).toBe('2024-01-01T00:00:00.000Z');
  });
});
