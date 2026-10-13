import { AxiosError } from 'axios';
import { Prisma } from '@prisma/client';

import {
  sanitizeAuditMetadata,
  scrubPii,
  serializeError,
} from '../../utils/error.utils';

describe('Error Utilities & PII Scrubbing (LOG-02)', () => {
  describe('scrubPii', () => {
    it('should redact plain email addresses', () => {
      const input =
        'Failed to invite user test.user+alias@example.com to tenant';
      expect(scrubPii(input)).toBe(
        'Failed to invite user [REDACTED_EMAIL] to tenant',
      );
    });

    it('should redact URL-encoded email addresses in URLs and query strings', () => {
      const input =
        'https://api.external.com/v1/user?email=customer%40example.com&status=active';
      expect(scrubPii(input)).toBe(
        'https://api.external.com/v1/user?email=[REDACTED_EMAIL]&status=active',
      );
    });

    it('should redact secret query parameters and tokens from URLs', () => {
      const input =
        'https://api.gateway.com/charge?token=tok_secret123&apiKey=ak_live_xyz&password=pass123&key=masterKey';
      const scrubbed = scrubPii(input);
      expect(scrubbed).toContain('token=[REDACTED]');
      expect(scrubbed).toContain('apiKey=[REDACTED]');
      expect(scrubbed).toContain('password=[REDACTED]');
      expect(scrubbed).toContain('key=[REDACTED]');
    });

    it('should redact Authorization Bearer tokens', () => {
      const input =
        'Request failed with header: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig';
      expect(scrubPii(input)).toBe(
        'Request failed with header: Authorization: Bearer [REDACTED]',
      );
    });

    it('should redact phone numbers in various formats', () => {
      expect(scrubPii('SMS delivery failed to +919876543210')).toBe(
        'SMS delivery failed to [REDACTED_PHONE]',
      );
      expect(scrubPii('Dialed +91 98765 43210 for OTP')).toBe(
        'Dialed [REDACTED_PHONE] for OTP',
      );
      expect(scrubPii('Contact at +1-800-555-0199 rejected')).toBe(
        'Contact at [REDACTED_PHONE] rejected',
      );
    });

    it('should preserve ISO timestamps, UUIDs, ULIDs, and status codes', () => {
      const input =
        'Event at 2026-10-12T18:30:00.000Z with id 01HZX8765432109876543210AB and uuid 123e4567-e89b-12d3-a456-426614174000 status 200';
      expect(scrubPii(input)).toBe(input);
    });

    it('should truncate strings exceeding MAX_SCRUB_TEXT_LENGTH to prevent ReDoS', () => {
      const longInput = 'A'.repeat(9000) + ' customer@example.com';
      const scrubbed = scrubPii(longInput);
      expect(scrubbed).toContain('... [TRUNCATED]');
      expect(scrubbed.length).toBeLessThan(longInput.length);
    });

    it('should return empty string for null, undefined, or non-string inputs', () => {
      expect(scrubPii(null)).toBe('');
      expect(scrubPii(undefined)).toBe('');
      expect(scrubPii('' as string)).toBe('');
    });
  });

  describe('serializeError', () => {
    it('should serialize standard Error and scrub PII from message and stack', () => {
      const err = new Error(
        'User user@example.com (+919876543210) could not be verified',
      );
      const serialized = serializeError(err);

      expect(serialized.name).toBe('Error');
      expect(serialized.message).toBe(
        'User [REDACTED_EMAIL] ([REDACTED_PHONE]) could not be verified',
      );
      expect(typeof serialized.stack).toBe('string');
      expect(serialized.stack).not.toContain('user@example.com');
      expect(serialized.stack).not.toContain('+919876543210');
    });

    it('should serialize AxiosError, strip config, and scrub PII from message and response data', () => {
      const axiosErr = new AxiosError(
        'Request failed with status code 400: https://api.brevo.com/v3/smtp/email?email=alice%40example.com&token=secret_abc',
        'ERR_BAD_REQUEST',
        { headers: { authorization: 'Bearer secret_jwt' } } as never,
        {},
        {
          status: 400,
          data: {
            error: 'Email alice@example.com is invalid',
            phone: '+919876543210',
          },
        } as never,
      );

      const serialized = serializeError(axiosErr);

      expect(serialized.message).toContain('[REDACTED_EMAIL]');
      expect(serialized.message).toContain('token=[REDACTED]');
      expect(serialized.httpStatus).toBe(400);
      expect(serialized.httpData).toEqual({
        error: 'Email [REDACTED_EMAIL] is invalid',
        phone: '[REDACTED_PHONE]',
      });
      // config is intentionally omitted
      expect(serialized).not.toHaveProperty('config');
    });

    it('should serialize PrismaClientKnownRequestError and preserve code/meta while scrubbing', () => {
      const prismaErr = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (email: test@example.com)',
        {
          code: 'P2002',
          clientVersion: '5.0.0',
          meta: { target: ['email'], email: 'test@example.com' },
        },
      );

      const serialized = serializeError(prismaErr);

      expect(serialized.code).toBe('P2002');
      expect(serialized.clientVersion).toBe('5.0.0');
      expect(serialized.message).toContain('[REDACTED_EMAIL]');
      expect(serialized.meta).toEqual({
        target: ['email'],
        email: '[REDACTED_EMAIL]',
      });
    });

    it('should scrub stack trace even when err.message contains no secrets', () => {
      const err = new Error('Generic database connection failed');
      err.stack =
        'Error: Generic database connection failed\n' +
        '    at Query.run (/app/db.ts:12:34?apiKey=super_secret_key&token=tok_abc)\n' +
        '    at User.find (/app/user.ts:56:78?email=leak@domain.com)';

      const serialized = serializeError(err);

      expect(serialized.message).toBe('Generic database connection failed');
      expect(serialized.stack).not.toContain('super_secret_key');
      expect(serialized.stack).toContain('apiKey=[REDACTED]');
      expect(serialized.stack).not.toContain('leak@domain.com');
      expect(serialized.stack).toContain('email=[REDACTED_EMAIL]');
    });

    it('should scrub multiple occurrences of secrets across stack frames', () => {
      const err = new Error('Failed with ?token=secret123');
      err.stack =
        'Error: Failed with ?token=secret123\n' +
        '    at callApi (/app/api.ts:10:20?token=secret123)\n' +
        '    at retry (/app/retry.ts:30:40?token=secret123)';

      const serialized = serializeError(err);

      expect(serialized.stack).not.toContain('secret123');
      const matches = serialized.stack?.match(/token=\[REDACTED\]/g);
      expect(matches?.length).toBe(3);
    });

    it('should serialize primitive errors and scrub PII', () => {
      const serialized = serializeError(
        'Failed for customer foo@bar.com with phone +919876543210',
      );
      expect(serialized).toEqual({
        message:
          'Failed for customer [REDACTED_EMAIL] with phone [REDACTED_PHONE]',
      });
    });
  });

  describe('sanitizeAuditMetadata', () => {
    it('should redact sensitive keys (password, token, apiKey, otp, secret, cardNumber)', () => {
      const metadata = {
        userId: 'usr-123',
        password: 'super-secret-password',
        token: 'ey.jwt.token',
        apiKey: 'sk_live_xyz',
        otp: '123456',
        cardNumber: '4111222233334444',
        cvv: '123',
      };

      const sanitized = sanitizeAuditMetadata(metadata);

      expect(sanitized).toEqual({
        userId: 'usr-123',
        password: '[Redacted]',
        token: '[Redacted]',
        apiKey: '[Redacted]',
        otp: '[Redacted]',
        cardNumber: '[Redacted]',
        cvv: '[Redacted]',
      });
    });

    it('should preserve authorized audit actor fields without destructive regex alteration', () => {
      const metadata = {
        adminEmail: 'security-engineer@breathaway.app',
        adminEmailHash:
          'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
        requestId: 'req-uuid-123',
        userAgent: 'BreathAway-iOS/1.0.0',
        ipAddress: '192.168.1.1',
      };

      const sanitized = sanitizeAuditMetadata(metadata);

      expect(sanitized).toEqual({
        adminEmail: 'security-engineer@breathaway.app',
        adminEmailHash:
          'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
        requestId: 'req-uuid-123',
        userAgent: 'BreathAway-iOS/1.0.0',
        ipAddress: '192.168.1.1',
      });
    });

    it('should serialize and scrub embedded Error instances in metadata', () => {
      const err = new Error(
        'Third-party payment gateway timeout: https://api.gateway.com/charge?email=buyer%40gmail.com&phone=%2B919876543210&token=tok_live_123',
      );

      const metadata = {
        action: 'PAYMENT_FAILED',
        error: err,
        reason: 'Payment notification failed for buyer@gmail.com',
      };

      const sanitized = sanitizeAuditMetadata(metadata);

      expect(sanitized?.action).toBe('PAYMENT_FAILED');
      expect(sanitized?.reason).toBe(
        'Payment notification failed for [REDACTED_EMAIL]',
      );

      const serializedError = sanitized?.error as Record<string, unknown>;
      expect(serializedError).toBeDefined();
      expect(serializedError.name).toBe('Error');
      expect(serializedError.message).toContain('[REDACTED_EMAIL]');
      expect(serializedError.message).toContain('[REDACTED_PHONE]');
      expect(serializedError.message).toContain('token=[REDACTED]');
    });

    it('should recursively sanitize nested objects and arrays', () => {
      const metadata = {
        attempts: [
          {
            phone: '+919876543210',
            password: 'rawPassword',
            status: 'FAILED',
          },
        ],
        details: {
          customerEmail: 'customer@test.com',
          nestedSecret: {
            apiKey: 'secret_key',
            info: 'Registered with phone +1-800-555-0199',
          },
        },
      };

      const sanitized = sanitizeAuditMetadata(metadata);

      expect(sanitized).toEqual({
        attempts: [
          {
            phone: '[REDACTED_PHONE]',
            password: '[Redacted]',
            status: 'FAILED',
          },
        ],
        details: {
          customerEmail: '[REDACTED_EMAIL]',
          nestedSecret: {
            apiKey: '[Redacted]',
            info: 'Registered with phone [REDACTED_PHONE]',
          },
        },
      });
    });

    it('should handle circular references safely without throwing RangeError', () => {
      const circular: Record<string, unknown> = {
        action: 'CIRCULAR_EVENT',
      };
      circular.self = circular;

      const sanitized = sanitizeAuditMetadata(circular);

      expect(sanitized?.action).toBe('CIRCULAR_EVENT');
      expect(sanitized?.self).toBe('[Circular]');
    });

    it('should preserve Date instances as ISO strings', () => {
      const date = new Date('2026-10-12T10:00:00.000Z');
      const metadata = {
        action: 'USER_REGISTERED',
        createdAt: date,
      };

      const sanitized = sanitizeAuditMetadata(metadata);

      expect(sanitized?.createdAt).toBe('2026-10-12T10:00:00.000Z');
    });

    it('should preserve Buffer instances without decomposing into index keys', () => {
      const metadata = {
        action: 'RAW_PAYLOAD',
        payload: Buffer.from('hello world', 'utf8'),
      };

      const sanitized = sanitizeAuditMetadata(metadata);

      expect(sanitized?.payload).toBe('[Binary Data]');
    });

    it('should return undefined or empty for empty input', () => {
      expect(sanitizeAuditMetadata(undefined)).toBeUndefined();
      expect(sanitizeAuditMetadata(null)).toBeUndefined();
      expect(sanitizeAuditMetadata({})).toEqual({});
    });
  });
});
