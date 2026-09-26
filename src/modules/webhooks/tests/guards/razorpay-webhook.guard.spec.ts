import { createHmac } from 'crypto';

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RazorpayWebhookGuard } from '../../guards/razorpay-webhook.guard';

describe('RazorpayWebhookGuard', () => {
  let guard: RazorpayWebhookGuard;
  let configService: jest.Mocked<ConfigService>;
  const mockSecret = 'rzp_webhook_secret_test_123';

  beforeEach(() => {
    configService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'RAZORPAY_WEBHOOK_SECRET') return mockSecret;
        throw new Error(`Unexpected key: ${key}`);
      }),
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    guard = new RazorpayWebhookGuard(configService);
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
    payload: string,
    secret: string = mockSecret,
  ): string => {
    return createHmac('sha256', secret).update(payload).digest('hex');
  };

  describe('canActivate', () => {
    it('should return true when HMAC signature matches rawBody', () => {
      // Arrange
      const payloadStr = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_123' } } },
      });
      const rawBody = Buffer.from(payloadStr, 'utf8');
      const signature = generateSignature(payloadStr);

      const context = createMockContext(
        { 'x-razorpay-signature': signature },
        JSON.parse(payloadStr),
        rawBody,
      );

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true when signature matches string body when rawBody is undefined', () => {
      // Arrange
      const payloadStr = JSON.stringify({ event: 'payment.captured' });
      const signature = generateSignature(payloadStr);

      const context = createMockContext(
        { 'x-razorpay-signature': signature },
        payloadStr,
      );

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException when X-Razorpay-Signature header is missing', () => {
      // Arrange
      const context = createMockContext({}, { event: 'payment.captured' });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when signature does not match', () => {
      // Arrange
      const payloadStr = JSON.stringify({ event: 'payment.captured' });
      const rawBody = Buffer.from(payloadStr, 'utf8');

      const context = createMockContext(
        { 'x-razorpay-signature': 'invalid_signature_hex' },
        JSON.parse(payloadStr),
        rawBody,
      );

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should handle array header value', () => {
      // Arrange
      const payloadStr = JSON.stringify({ event: 'payment.captured' });
      const rawBody = Buffer.from(payloadStr, 'utf8');
      const signature = generateSignature(payloadStr);

      const context = createMockContext(
        { 'x-razorpay-signature': [signature, 'secondary'] },
        JSON.parse(payloadStr),
        rawBody,
      );

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });
});
