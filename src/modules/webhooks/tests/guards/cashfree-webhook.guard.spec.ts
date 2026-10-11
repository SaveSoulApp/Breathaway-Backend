import { createHmac } from 'crypto';

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CashfreeWebhookGuard } from '../../guards/cashfree-webhook.guard';

describe('CashfreeWebhookGuard', () => {
  let guard: CashfreeWebhookGuard;
  let configService: jest.Mocked<ConfigService>;
  const mockSecret = 'cf_webhook_secret_test_123';

  beforeEach(() => {
    configService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'CASHFREE_SECRET_KEY') return mockSecret;
        throw new Error(`Unexpected key: ${key}`);
      }),
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    guard = new CashfreeWebhookGuard(configService);
  });

  const createMockContext = (
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    rawBody?: Buffer,
  ): ExecutionContext => {
    const request = {
      headers,
      body,
      rawBody,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: jest.fn(),
        getNext: jest.fn(),
      }),
      getClass: jest.fn(),
      getHandler: jest.fn(),
    } as unknown as ExecutionContext;
  };

  const generateSignature = (
    timestamp: string,
    payload: string,
    secret: string = mockSecret,
  ): string => {
    return createHmac('sha256', secret)
      .update(`${timestamp}${payload}`)
      .digest('base64');
  };

  describe('canActivate', () => {
    it('should return true when HMAC signature matches timestamp + rawBody', () => {
      // Arrange
      const timestamp = String(Math.floor(Date.now() / 1000));
      const payloadStr = JSON.stringify({
        data: {
          order: { order_id: 'rcpt_123' },
          payment: { cf_payment_id: '12345' },
        },
        event_type: 'PAYMENT_SUCCESS_WEBHOOK',
      });
      const rawBody = Buffer.from(payloadStr, 'utf8');
      const signature = generateSignature(timestamp, payloadStr);

      const context = createMockContext(
        {
          'x-webhook-signature': signature,
          'x-webhook-timestamp': timestamp,
        },
        JSON.parse(payloadStr),
        rawBody,
      );

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException when x-webhook-signature header is missing', () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const context = createMockContext(
        { 'x-webhook-timestamp': timestamp },
        {},
      );

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when x-webhook-timestamp header is missing', () => {
      const context = createMockContext(
        { 'x-webhook-signature': 'some_sig' },
        {},
      );

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when signature does not match', () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const payloadStr = JSON.stringify({
        event_type: 'PAYMENT_SUCCESS_WEBHOOK',
      });
      const rawBody = Buffer.from(payloadStr, 'utf8');

      const context = createMockContext(
        {
          'x-webhook-signature': 'invalid_base64_sig',
          'x-webhook-timestamp': timestamp,
        },
        JSON.parse(payloadStr),
        rawBody,
      );

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when timestamp is outside 5-minute tolerance window', () => {
      const oldTimestamp = String(Math.floor(Date.now() / 1000) - 600); // 10 minutes ago
      const payloadStr = JSON.stringify({
        event_type: 'PAYMENT_SUCCESS_WEBHOOK',
      });
      const rawBody = Buffer.from(payloadStr, 'utf8');
      const signature = generateSignature(oldTimestamp, payloadStr);

      const context = createMockContext(
        {
          'x-webhook-signature': signature,
          'x-webhook-timestamp': oldTimestamp,
        },
        JSON.parse(payloadStr),
        rawBody,
      );

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });
});
