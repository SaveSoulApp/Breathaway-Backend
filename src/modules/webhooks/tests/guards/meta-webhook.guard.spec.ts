import { createHmac } from 'crypto';

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MetaWebhookGuard } from '../../guards/meta-webhook.guard';

describe('MetaWebhookGuard', () => {
  let guard: MetaWebhookGuard;
  let configService: jest.Mocked<ConfigService>;
  const mockSecret = 'meta_app_secret_test_123';

  beforeEach(() => {
    configService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'META_APP_SECRET') return mockSecret;
        throw new Error(`Unexpected key: ${key}`);
      }),
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    guard = new MetaWebhookGuard(configService);
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
    payload: string | Buffer,
    secret: string = mockSecret,
    prefix = 'sha256=',
  ): string => {
    const hash = createHmac('sha256', secret).update(payload).digest('hex');
    return `${prefix}${hash}`;
  };

  describe('canActivate', () => {
    it('should return true when HMAC signature matches rawBody', () => {
      const payloadStr = JSON.stringify({
        object: 'instagram',
        entry: [{ id: '123' }],
      });
      const rawBody = Buffer.from(payloadStr, 'utf8');
      const signature = generateSignature(rawBody);

      const context = createMockContext(
        { 'x-hub-signature-256': signature },
        JSON.parse(payloadStr),
        rawBody,
      );

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should return true when signature matches string body when rawBody is undefined', () => {
      const payloadStr = JSON.stringify({
        object: 'instagram',
        entry: [{ id: '123' }],
      });
      const signature = generateSignature(payloadStr);

      const context = createMockContext(
        { 'x-hub-signature-256': signature },
        JSON.parse(payloadStr),
        undefined,
      );

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should return true when signature is case-insensitive (e.g. uppercase SHA256=)', () => {
      const payloadStr = JSON.stringify({ object: 'page' });
      const rawBody = Buffer.from(payloadStr, 'utf8');
      const signature = generateSignature(rawBody, mockSecret, 'SHA256=');

      const context = createMockContext(
        { 'x-hub-signature-256': signature },
        JSON.parse(payloadStr),
        rawBody,
      );

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should return true when signature header is provided as an array', () => {
      const payloadStr = JSON.stringify({ object: 'instagram' });
      const rawBody = Buffer.from(payloadStr, 'utf8');
      const signature = generateSignature(rawBody);

      const context = createMockContext(
        { 'x-hub-signature-256': [signature] },
        JSON.parse(payloadStr),
        rawBody,
      );

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException when X-Hub-Signature-256 header is missing', () => {
      const context = createMockContext({}, { object: 'instagram' });

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Missing X-Hub-Signature-256 header'),
      );
    });

    it('should throw UnauthorizedException when header value is empty or whitespace', () => {
      const context = createMockContext(
        { 'x-hub-signature-256': '   ' },
        { object: 'instagram' },
      );

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Missing X-Hub-Signature-256 header value'),
      );
    });

    it('should throw UnauthorizedException when signature is invalid (different secret)', () => {
      const payloadStr = JSON.stringify({ object: 'instagram' });
      const rawBody = Buffer.from(payloadStr, 'utf8');
      const wrongSignature = generateSignature(rawBody, 'wrong_secret');

      const context = createMockContext(
        { 'x-hub-signature-256': wrongSignature },
        JSON.parse(payloadStr),
        rawBody,
      );

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Invalid Meta webhook signature'),
      );
    });

    it('should throw UnauthorizedException when signature length does not match', () => {
      const context = createMockContext(
        { 'x-hub-signature-256': 'sha256=short' },
        { object: 'instagram' },
        Buffer.from('{}', 'utf8'),
      );

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Invalid Meta webhook signature'),
      );
    });

    it('should throw when ConfigService throws missing META_APP_SECRET', () => {
      configService.getOrThrow.mockImplementationOnce(() => {
        throw new Error('Config missing');
      });

      const context = createMockContext(
        { 'x-hub-signature-256': 'sha256=123' },
        { object: 'instagram' },
      );

      expect(() => guard.canActivate(context)).toThrow('Config missing');
    });
  });
});
