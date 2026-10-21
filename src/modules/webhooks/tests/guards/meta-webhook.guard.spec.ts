import { createHmac } from 'crypto';

import {
  ExecutionContext,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerService } from '@core/logger';

import { MetaWebhookGuard } from '../../guards/meta-webhook.guard';

describe('MetaWebhookGuard', () => {
  let guard: MetaWebhookGuard;
  let configService: jest.Mocked<ConfigService>;
  let loggerService: jest.Mocked<LoggerService>;
  let contextualLogger: {
    warn: jest.Mock;
    debug: jest.Mock;
    info: jest.Mock;
    error: jest.Mock;
    log: jest.Mock;
  };
  const mockSecret = 'meta_app_secret_test_123';

  beforeEach(() => {
    configService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'META_APP_SECRET') return mockSecret;
        throw new Error(`Unexpected key: ${key}`);
      }),
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    contextualLogger = {
      warn: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
    };

    loggerService = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    } as unknown as jest.Mocked<LoggerService>;

    guard = new MetaWebhookGuard(configService, loggerService);
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
        payloadStr,
        undefined,
      );

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should throw InternalServerErrorException when rawBody is undefined and body is parsed object', () => {
      const payload = { object: 'instagram' };
      const signature = generateSignature(JSON.stringify(payload));

      const context = createMockContext(
        { 'x-hub-signature-256': signature },
        payload,
        undefined,
      );

      expect(() => guard.canActivate(context)).toThrow(
        new InternalServerErrorException(
          'Raw body buffering is required for Meta webhook signature verification',
        ),
      );
      expect(contextualLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('request.rawBody is missing'),
        { step: 'raw_body_missing' },
      );
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
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Meta webhook signature verification failed',
        expect.objectContaining({
          step: 'signature_mismatch',
        }),
      );
    });

    it('should omit rawBodyPreview and signatures from mismatch warning log when DEPLOYMENT_ENV is not local (e.g. gcp)', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DEPLOYMENT_ENV') return 'gcp';
        return undefined;
      });

      const payloadStr = JSON.stringify({
        object: 'instagram',
        secretData: 'sensitive_dm',
      });
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

      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Meta webhook signature verification failed',
        expect.not.objectContaining({
          rawBodyPreview: expect.anything(),
          receivedSig: expect.anything(),
        }),
      );
    });

    it('should include rawBodyPreview and signatures in mismatch warning log when DEPLOYMENT_ENV is local', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DEPLOYMENT_ENV') return 'local';
        return undefined;
      });

      const payloadStr = JSON.stringify({
        object: 'instagram',
        secretData: 'sensitive_dm',
      });
      const rawBody = Buffer.from(payloadStr, 'utf8');
      const wrongSignature = generateSignature(rawBody, 'wrong_secret');

      const context = createMockContext(
        {
          'x-hub-signature-256': wrongSignature,
          'x-hub-signature': 'sha1=legacy_hash',
        },
        JSON.parse(payloadStr),
        rawBody,
      );

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Invalid Meta webhook signature'),
      );

      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Meta webhook signature verification failed',
        expect.objectContaining({
          step: 'signature_mismatch',
          receivedSig: wrongSignature,
          expectedSig: expect.stringMatching(/^sha256=/),
          legacySha1Sig: 'sha1=legacy_hash',
          rawBodyPreview: rawBody.toString('utf8').slice(0, 500),
        }),
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
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Meta webhook signature verification failed',
        expect.objectContaining({
          step: 'signature_mismatch',
        }),
      );
    });

    it('should throw UnauthorizedException when signature lacks sha256= prefix', () => {
      const context = createMockContext(
        { 'x-hub-signature-256': 'md5=invalid_prefix_signature' },
        { object: 'instagram' },
        Buffer.from('{}', 'utf8'),
      );

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Invalid Meta webhook signature'),
      );
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Meta webhook signature missing sha256= prefix',
        expect.objectContaining({
          step: 'invalid_signature_prefix',
        }),
      );
    });

    it('should return true when META_APP_SECRET has leading or trailing whitespace / newlines', () => {
      configService.getOrThrow.mockReturnValueOnce(`  ${mockSecret}\n\r  `);

      const payloadStr = JSON.stringify({ object: 'instagram' });
      const rawBody = Buffer.from(payloadStr, 'utf8');
      const signature = generateSignature(rawBody, mockSecret);

      const context = createMockContext(
        { 'x-hub-signature-256': signature },
        JSON.parse(payloadStr),
        rawBody,
      );

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should return true when signature header has leading or trailing whitespace', () => {
      const payloadStr = JSON.stringify({ object: 'instagram' });
      const rawBody = Buffer.from(payloadStr, 'utf8');
      const signature = `  ${generateSignature(rawBody, mockSecret)}  `;

      const context = createMockContext(
        { 'x-hub-signature-256': signature },
        JSON.parse(payloadStr),
        rawBody,
      );

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should throw InternalServerErrorException when META_APP_SECRET is only whitespace', () => {
      configService.getOrThrow.mockReturnValueOnce('   \n  ');

      const context = createMockContext(
        { 'x-hub-signature-256': 'sha256=1234567890abcdef' },
        { object: 'instagram' },
      );

      expect(() => guard.canActivate(context)).toThrow(
        new InternalServerErrorException(
          'META_APP_SECRET configuration is empty',
        ),
      );
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'META_APP_SECRET is empty after trimming whitespace',
        { step: 'empty_meta_app_secret' },
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
