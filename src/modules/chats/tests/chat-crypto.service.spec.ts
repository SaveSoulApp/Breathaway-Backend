import { randomBytes } from 'crypto';

import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerService } from '@core/logger';

import { ChatCryptoService } from '../services/chat-crypto.service';

describe('ChatCryptoService', () => {
  let service: ChatCryptoService;
  let configService: ConfigService;
  let loggerService: LoggerService;

  const chatMasterKey1 = randomBytes(32);
  const chatMasterKey2 = randomBytes(32);

  const mockChatKeysJson = JSON.stringify({
    'chat-v1': chatMasterKey1.toString('base64'),
    'chat-v2': chatMasterKey2.toString('base64'),
  });

  const createConfigMock = (
    overrides: Record<string, string | undefined> = {},
  ) => {
    const configMap: Record<string, string | undefined> = {
      GCP_SECRET_CHAT_MASTER_KEYS: mockChatKeysJson,
      ACTIVE_CHAT_MASTER_KEY_ID: 'chat-v1',
      ...overrides,
    };

    return {
      get: jest.fn((key: string) => configMap[key]),
    } as unknown as ConfigService;
  };

  beforeEach(() => {
    loggerService = {
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      forContext: jest.fn().mockReturnThis(),
    } as unknown as LoggerService;

    configService = createConfigMock();
    service = new ChatCryptoService(loggerService, configService);
  });

  describe('initialization and fallbacks', () => {
    it('should initialize successfully with valid chat master keys', () => {
      expect(service).toBeDefined();
    });

    it('should fallback to GCP_SECRET_MASTER_KEYS when GCP_SECRET_CHAT_MASTER_KEYS is missing', () => {
      const fallbackMasterKey = randomBytes(32);
      const fallbackConfig = {
        get: jest.fn((key: string) => {
          if (key === 'GCP_SECRET_MASTER_KEYS') {
            return JSON.stringify({
              'key-v1': fallbackMasterKey.toString('base64'),
            });
          }
          if (key === 'ACTIVE_MASTER_KEY_ID') return 'key-v1';
          return undefined;
        }),
      } as unknown as ConfigService;

      const fallbackService = new ChatCryptoService(
        loggerService,
        fallbackConfig,
      );
      expect(fallbackService).toBeDefined();

      const roomKey = fallbackService.generateRoomKey();
      const { wrappedRoomKey, roomKeyId } =
        fallbackService.wrapRoomKey(roomKey);
      expect(roomKeyId).toBe('key-v1');

      const unwrapped = fallbackService.unwrapRoomKey(
        wrappedRoomKey,
        roomKeyId,
      );
      expect(unwrapped).toEqual(roomKey);
    });

    it('should generate an ephemeral key if no configuration keys are provided in non-production', () => {
      const emptyConfig = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      const ephemeralService = new ChatCryptoService(
        loggerService,
        emptyConfig,
      );
      expect(ephemeralService).toBeDefined();
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('generating ephemeral fallback key'),
        expect.any(Object),
      );

      const roomKey = ephemeralService.generateRoomKey();
      const { wrappedRoomKey, roomKeyId } =
        ephemeralService.wrapRoomKey(roomKey);
      const unwrapped = ephemeralService.unwrapRoomKey(
        wrappedRoomKey,
        roomKeyId,
      );
      expect(unwrapped).toEqual(roomKey);
    });

    it('should throw an Error in production when chat master keys are missing', () => {
      const prodConfig = {
        get: jest.fn((key: string) => {
          if (key === 'NODE_ENV') return 'production';
          return undefined;
        }),
      } as unknown as ConfigService;

      expect(() => new ChatCryptoService(loggerService, prodConfig)).toThrow(
        /Fatal: GCP_SECRET_CHAT_MASTER_KEYS is required in production environment/,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Fatal: No valid chat master keys configured in production',
        ),
        expect.any(Object),
      );
    });

    it('should trim whitespace and trailing newlines from master key IDs and base64 payloads', () => {
      const rawKey = randomBytes(32);
      const untrimmedConfig = {
        get: jest.fn((key: string) => {
          if (key === 'GCP_SECRET_CHAT_MASTER_KEYS') {
            return JSON.stringify({
              ' chat-v1\n': `  ${rawKey.toString('base64')}\n  `,
            });
          }
          if (key === 'ACTIVE_CHAT_MASTER_KEY_ID') return ' chat-v1\n';
          return undefined;
        }),
      } as unknown as ConfigService;

      const trimmedService = new ChatCryptoService(
        loggerService,
        untrimmedConfig,
      );
      expect(trimmedService).toBeDefined();

      const roomKey = trimmedService.generateRoomKey();
      const { wrappedRoomKey, roomKeyId } = trimmedService.wrapRoomKey(roomKey);
      expect(roomKeyId).toBe('chat-v1');

      const unwrapped = trimmedService.unwrapRoomKey(wrappedRoomKey, 'chat-v1');
      expect(unwrapped).toEqual(roomKey);
    });
  });

  describe('generateRoomKey', () => {
    it('should generate a 32-byte cryptographically secure Buffer', () => {
      const key1 = service.generateRoomKey();
      const key2 = service.generateRoomKey();

      expect(Buffer.isBuffer(key1)).toBe(true);
      expect(key1.length).toBe(32);
      expect(key2.length).toBe(32);
      expect(key1).not.toEqual(key2);
    });
  });

  describe('wrapRoomKey and unwrapRoomKey', () => {
    it('should wrap and unwrap a room key successfully', () => {
      const plaintextKey = service.generateRoomKey();
      const { wrappedRoomKey, roomKeyId } = service.wrapRoomKey(plaintextKey);

      expect(typeof wrappedRoomKey).toBe('string');
      expect(roomKeyId).toBe('chat-v1');

      // Unwrap should restore exact 32 bytes
      const unwrapped = service.unwrapRoomKey(wrappedRoomKey, roomKeyId);
      expect(unwrapped).toEqual(plaintextKey);
    });

    it('should support wrapping with another specific key version', () => {
      const plaintextKey = service.generateRoomKey();
      const { wrappedRoomKey, roomKeyId } = service.wrapRoomKey(
        plaintextKey,
        'chat-v2',
      );

      expect(roomKeyId).toBe('chat-v2');
      const unwrapped = service.unwrapRoomKey(wrappedRoomKey, 'chat-v2');
      expect(unwrapped).toEqual(plaintextKey);
    });

    it('should utilize cache on subsequent unwrap calls', () => {
      const plaintextKey = service.generateRoomKey();
      const { wrappedRoomKey, roomKeyId } = service.wrapRoomKey(plaintextKey);

      // First call (cached from wrapRoomKey)
      const unwrapped1 = service.unwrapRoomKey(wrappedRoomKey, roomKeyId);
      // Second call (hits cache)
      const unwrapped2 = service.unwrapRoomKey(wrappedRoomKey, roomKeyId);

      expect(unwrapped1).toEqual(plaintextKey);
      expect(unwrapped2).toEqual(plaintextKey);
    });

    it('should refresh entry position on cache hit to maintain LRU eviction', () => {
      const key1 = service.generateRoomKey();
      const wrap1 = service.wrapRoomKey(key1);

      const key2 = service.generateRoomKey();
      const wrap2 = service.wrapRoomKey(key2);

      // Access key1 so it is refreshed to most-recently-used
      service.unwrapRoomKey(wrap1.wrappedRoomKey, wrap1.roomKeyId);

      // Verify both keys are accessible
      expect(
        service.unwrapRoomKey(wrap1.wrappedRoomKey, wrap1.roomKeyId),
      ).toEqual(key1);
      expect(
        service.unwrapRoomKey(wrap2.wrappedRoomKey, wrap2.roomKeyId),
      ).toEqual(key2);
    });

    it('should throw InternalServerErrorException when wrapping invalid key length', () => {
      const invalidKey = randomBytes(16);
      expect(() => service.wrapRoomKey(invalidKey)).toThrow(
        InternalServerErrorException,
      );
    });

    it('should throw InternalServerErrorException when unwrapping unknown keyId', () => {
      const plaintextKey = service.generateRoomKey();
      const { wrappedRoomKey } = service.wrapRoomKey(plaintextKey);

      expect(() =>
        service.unwrapRoomKey(wrappedRoomKey, 'non-existent-key'),
      ).toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException when unwrapping tampered wrapped key', () => {
      const plaintextKey = service.generateRoomKey();
      const { wrappedRoomKey, roomKeyId } = service.wrapRoomKey(plaintextKey);

      service.clearCache(); // Clear in-memory cache to force decipher execution

      // Tamper with the base64 wrapped key
      const buf = Buffer.from(wrappedRoomKey, 'base64');
      buf[buf.length - 1] ^= 1;
      const tamperedBase64 = buf.toString('base64');

      expect(() => service.unwrapRoomKey(tamperedBase64, roomKeyId)).toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('encryptMessage and decryptMessage', () => {
    it('should encrypt and decrypt a message string correctly', () => {
      const roomKey = service.generateRoomKey();
      const originalText = 'Hello there! Excited for our meetup tonight! 🚀';

      const encrypted = service.encryptMessage(originalText, roomKey);
      expect(encrypted).toMatch(
        /^enc:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/,
      );

      const decrypted = service.decryptMessage(encrypted, roomKey);
      expect(decrypted).toBe(originalText);
    });

    it('should produce different ciphertexts for the same plaintext due to random IVs', () => {
      const roomKey = service.generateRoomKey();
      const text = 'Repeat message';

      const enc1 = service.encryptMessage(text, roomKey);
      const enc2 = service.encryptMessage(text, roomKey);

      expect(enc1).not.toBe(enc2);
      expect(service.decryptMessage(enc1, roomKey)).toBe(text);
      expect(service.decryptMessage(enc2, roomKey)).toBe(text);
    });

    it('should throw InternalServerErrorException for unencrypted plaintext messages', () => {
      const roomKey = service.generateRoomKey();
      const legacyPlaintext = 'This is an old unencrypted message from 2025';

      expect(() => service.decryptMessage(legacyPlaintext, roomKey)).toThrow(
        InternalServerErrorException,
      );
    });

    it('should throw InternalServerErrorException if ciphertext is tampered', () => {
      const roomKey = service.generateRoomKey();
      const encrypted = service.encryptMessage('Secret info', roomKey);

      const parts = encrypted.split(':');
      const tamperedCiphertext = Buffer.from(parts[4], 'base64');
      tamperedCiphertext[0] ^= 1;
      parts[4] = tamperedCiphertext.toString('base64');

      const tamperedPayload = parts.join(':');

      expect(() => service.decryptMessage(tamperedPayload, roomKey)).toThrow(
        InternalServerErrorException,
      );
    });

    it('should fail gracefully throwing InternalServerErrorException when decrypted with an incorrect key', () => {
      const correctRoomKey = service.generateRoomKey();
      const incorrectRoomKey = service.generateRoomKey();
      const sensitiveText = 'Top-secret message content';

      const encrypted = service.encryptMessage(sensitiveText, correctRoomKey);

      expect(() => service.decryptMessage(encrypted, incorrectRoomKey)).toThrow(
        InternalServerErrorException,
      );

      expect(() => service.decryptMessage(encrypted, incorrectRoomKey)).toThrow(
        'Failed to decrypt message content',
      );

      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to decrypt message content',
        expect.objectContaining({
          step: 'decrypt_message',
          err: expect.any(Object),
        }),
      );
    });

    it('should maintain consistent execution without leaking timing or internal tag details when key or tag is mismatched', () => {
      const correctKey = service.generateRoomKey();
      const wrongKey = service.generateRoomKey();
      const encrypted = service.encryptMessage(
        'Test timing consistency',
        correctKey,
      );

      // Decryption with wrong key must throw sanitized generic exception
      try {
        service.decryptMessage(encrypted, wrongKey);
        fail('Expected decryptMessage to throw');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(InternalServerErrorException);
        const exception = err as InternalServerErrorException;
        // Verify no raw crypto internal state or sensitive ciphertext is exposed in the exception message
        expect(exception.message).toBe('Failed to decrypt message content');
        expect(exception.message).not.toContain('auth');
        expect(exception.message).not.toContain('tag');
        expect(exception.message).not.toContain('cipher');
      }
    });
  });

  describe('isEncryptedMessage', () => {
    it('should return true for valid enc:v1 format', () => {
      const roomKey = service.generateRoomKey();
      const encrypted = service.encryptMessage('Test', roomKey);

      expect(service.isEncryptedMessage(encrypted)).toBe(true);
    });

    it('should return false for plain text or null/undefined', () => {
      expect(service.isEncryptedMessage('Plain text message')).toBe(false);
      expect(service.isEncryptedMessage(null)).toBe(false);
      expect(service.isEncryptedMessage(undefined)).toBe(false);
      expect(service.isEncryptedMessage('')).toBe(false);
      expect(service.isEncryptedMessage('enc:v2:short')).toBe(false);
    });
  });
});
