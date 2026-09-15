import { createHmac } from 'crypto';

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RevenueCatWebhookGuard } from '../../guards/revenuecat-webhook.guard';

describe('RevenueCatWebhookGuard', () => {
  let guard: RevenueCatWebhookGuard;
  let configService: jest.Mocked<ConfigService>;
  const mockSecret = 'rc_webhook_secret_test_123';

  beforeEach(() => {
    // Arrange
    configService = {
      getOrThrow: jest.fn().mockReturnValue(mockSecret),
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    guard = new RevenueCatWebhookGuard(configService);
  });

  const createMockContext = (
    headers: Record<string, string | undefined>,
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

  const generateSignatureHeader = (
    timestamp: number,
    payload: string,
    secret: string = mockSecret,
  ): string => {
    const signedPayload = `${timestamp}.${payload}`;
    const sig = createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');
    return `t=${timestamp},v1=${sig}`;
  };

  describe('canActivate', () => {
    it('should return true when HMAC signature and timestamp are valid', () => {
      // Arrange
      const nowSec = Math.floor(Date.now() / 1000);
      const rawPayload = JSON.stringify({
        event: { id: 'evt-1', type: 'NON_RENEWING_PURCHASE' },
      });
      const header = generateSignatureHeader(nowSec, rawPayload);
      const context = createMockContext(
        { 'x-revenuecat-webhook-signature': header },
        JSON.parse(rawPayload),
        Buffer.from(rawPayload, 'utf8'),
      );

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(configService.getOrThrow).toHaveBeenCalledWith(
        'REVENUECAT_WEBHOOK_SECRET',
      );
    });

    it('should throw UnauthorizedException when signature header is missing', () => {
      // Arrange
      const context = createMockContext({}, { foo: 'bar' });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException(
          'Missing RevenueCat webhook signature header',
        ),
      );
    });

    it('should throw UnauthorizedException when header format is malformed', () => {
      // Arrange — missing v1
      const context = createMockContext(
        { 'x-revenuecat-webhook-signature': 't=123456789' },
        { foo: 'bar' },
      );

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException(
          'Invalid RevenueCat webhook signature format',
        ),
      );
    });

    it('should throw UnauthorizedException when timestamp format is non-numeric', () => {
      // Arrange
      const context = createMockContext(
        { 'x-revenuecat-webhook-signature': 't=not-a-number,v1=abcdef' },
        { foo: 'bar' },
      );

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException(
          'Invalid RevenueCat webhook timestamp format',
        ),
      );
    });

    it('should throw UnauthorizedException when timestamp is older than tolerance window (300s)', () => {
      // Arrange — 6 minutes in the past
      const staleTimestamp = Math.floor(Date.now() / 1000) - 360;
      const rawPayload = JSON.stringify({ event: { id: 'evt-1' } });
      const header = generateSignatureHeader(staleTimestamp, rawPayload);
      const context = createMockContext(
        { 'x-revenuecat-webhook-signature': header },
        JSON.parse(rawPayload),
      );

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException(
          'RevenueCat webhook signature timestamp outside tolerance window',
        ),
      );
    });

    it('should throw UnauthorizedException when signature hash does not match', () => {
      // Arrange — signed with a different secret
      const nowSec = Math.floor(Date.now() / 1000);
      const rawPayload = JSON.stringify({ event: { id: 'evt-1' } });
      const forgedHeader = generateSignatureHeader(
        nowSec,
        rawPayload,
        'wrong-secret',
      );
      const context = createMockContext(
        { 'x-revenuecat-webhook-signature': forgedHeader },
        JSON.parse(rawPayload),
      );

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Invalid RevenueCat webhook signature hash'),
      );
    });
  });
});
