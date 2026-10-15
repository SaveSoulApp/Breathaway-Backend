import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import {
  decryptAesGcm,
  encryptAesGcm,
  generateDataKey,
} from '@core/crypto/crypto.utils';
import { LoggerService } from '@core/logger';

/**
 * ChatCryptoService
 * -----------------
 * Handles room-level cryptographic operations for chat messages.
 *
 * Architecture:
 * - Room Data Encryption Keys (DEKs): 256-bit AES keys generated per chat room.
 * - Master Key Wrapping: DEKs are wrapped using AES-256-GCM via long-term master keys
 *   loaded from GCP Secret Manager (GCP_SECRET_CHAT_MASTER_KEYS or GCP_SECRET_MASTER_KEYS).
 * - Message Encryption: Each message is encrypted with the room DEK using AES-256-GCM
 *   with a cryptographically random 96-bit IV, formatted as compact ciphertext:
 *   `enc:v1:<ivBase64>:<tagBase64>:<ciphertextBase64>`
 * - In-Memory Cache: Caches unwrapped room DEKs with an LRU TTL to deliver sub-millisecond
 *   encryption/decryption without repetitive key-unwrapping overhead.
 */
@Injectable()
export class ChatCryptoService extends BaseService {
  private readonly chatMasterKeys = new Map<string, Buffer>();
  private readonly activeKeyId: string;

  private readonly unwrappedRoomKeyCache = new Map<
    string,
    { key: Buffer; expiresAt: number }
  >();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_CACHE_SIZE = 1000;

  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(logger);

    // 1. Attempt to load dedicated chat master keys; fallback to general master keys
    const chatKeysJson =
      this.configService.get<string>('GCP_SECRET_CHAT_MASTER_KEYS') ??
      this.configService.get<string>('GCP_SECRET_MASTER_KEYS');

    const activeKeyId =
      this.configService.get<string>('ACTIVE_CHAT_MASTER_KEY_ID') ??
      this.configService.get<string>('ACTIVE_MASTER_KEY_ID') ??
      'chat-v1';

    if (chatKeysJson) {
      try {
        const parsed = JSON.parse(chatKeysJson) as Record<string, string>;
        for (const [keyId, base64] of Object.entries(parsed)) {
          const keyBuffer = Buffer.from(base64, 'base64');
          if (keyBuffer.length !== 32) {
            this.logger.warn(`Invalid chat master key length for ${keyId}`, {
              step: 'init',
              expected: 32,
              actual: keyBuffer.length,
            });
            continue;
          }
          this.chatMasterKeys.set(keyId, keyBuffer);
        }
      } catch (err: unknown) {
        this.logger.error('Failed to parse chat master keys JSON', {
          step: 'init',
          err: serializeError(err),
        });
      }
    }

    // In testing or fallback environments without keys loaded, create an ephemeral key
    if (this.chatMasterKeys.size === 0) {
      this.logger.warn(
        'No valid chat master keys found in configuration; generating ephemeral fallback key',
        { step: 'init' },
      );
      this.chatMasterKeys.set(activeKeyId, randomBytes(32));
    }

    // Validate that the active key ID is present; if not, use the first available key
    if (this.chatMasterKeys.has(activeKeyId)) {
      this.activeKeyId = activeKeyId;
    } else {
      const firstAvailable = Array.from(this.chatMasterKeys.keys())[0];
      if (firstAvailable) {
        this.activeKeyId = firstAvailable;
      } else {
        const ephemeralKey = randomBytes(32);
        this.chatMasterKeys.set(activeKeyId, ephemeralKey);
        this.activeKeyId = activeKeyId;
      }
    }
  }

  /**
   * Generates a new 32-byte (256-bit) cryptographically secure AES data key for a chat room.
   */
  generateRoomKey(): Buffer {
    return generateDataKey();
  }

  /**
   * Wraps (encrypts) a room data key using the active chat master key via AES-256-GCM.
   *
   * Format: `[12-byte IV][16-byte Tag][32-byte Ciphertext]` encoded in Base64.
   *
   * @param plaintextKey - The 32-byte raw AES-256 room data key.
   * @param keyId - Optional target master key identifier.
   * @returns Object containing the base64 wrapped key and the key ID used.
   */
  wrapRoomKey(
    plaintextKey: Buffer,
    keyId?: string,
  ): { wrappedRoomKey: string; roomKeyId: string } {
    if (plaintextKey.length !== 32) {
      throw new InternalServerErrorException(
        'Invalid room data key length (must be 32 bytes)',
      );
    }

    const targetKeyId = keyId ?? this.activeKeyId;
    const masterKey = this.chatMasterKeys.get(targetKeyId);

    if (!masterKey) {
      throw new InternalServerErrorException(
        `Chat master key '${targetKeyId}' not found`,
      );
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', masterKey, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintextKey),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    const wrappedBuffer = Buffer.concat([iv, tag, ciphertext]);
    const wrappedRoomKey = wrappedBuffer.toString('base64');

    // Seed the cache with the newly wrapped key
    this.cacheUnwrappedKey(wrappedRoomKey, targetKeyId, plaintextKey);

    return {
      wrappedRoomKey,
      roomKeyId: targetKeyId,
    };
  }

  /**
   * Unwraps (decrypts) a room data key using the specified chat master key.
   *
   * @param wrappedRoomKeyBase64 - The Base64-encoded wrapped data key.
   * @param roomKeyId - Master key ID used during wrapping.
   * @returns The raw 32-byte room data key as Buffer.
   */
  unwrapRoomKey(wrappedRoomKeyBase64: string, roomKeyId: string): Buffer {
    if (!roomKeyId) {
      throw new InternalServerErrorException(
        'Missing chat master key ID for unwrapping',
      );
    }

    const cachedKey = this.getCachedUnwrappedKey(
      wrappedRoomKeyBase64,
      roomKeyId,
    );
    if (cachedKey) {
      return cachedKey;
    }

    const masterKey = this.chatMasterKeys.get(roomKeyId);
    if (!masterKey) {
      throw new InternalServerErrorException(
        `Chat master key '${roomKeyId}' not found for unwrapping`,
      );
    }

    const wrappedBuffer = Buffer.from(wrappedRoomKeyBase64, 'base64');
    if (wrappedBuffer.length < 60) {
      throw new InternalServerErrorException(
        'Malformed wrapped room key buffer',
      );
    }

    const iv = wrappedBuffer.subarray(0, 12);
    const tag = wrappedBuffer.subarray(12, 28);
    const ciphertext = wrappedBuffer.subarray(28);

    try {
      const decipher = createDecipheriv('aes-256-gcm', masterKey, iv);
      decipher.setAuthTag(tag);
      const plaintextKey = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      if (plaintextKey.length !== 32) {
        throw new InternalServerErrorException(
          'Unwrapped room key invalid length',
        );
      }

      this.cacheUnwrappedKey(wrappedRoomKeyBase64, roomKeyId, plaintextKey);
      return plaintextKey;
    } catch (err: unknown) {
      this.logger.error('Failed to unwrap chat room key', {
        step: 'unwrap_room_key',
        roomKeyId,
        err: serializeError(err),
      });
      throw new InternalServerErrorException(
        'Failed to unwrap chat room encryption key',
      );
    }
  }

  /**
   * Encrypts plaintext message content using AES-256-GCM and the room's data key.
   *
   * Output format: `enc:v1:<ivBase64>:<tagBase64>:<ciphertextBase64>`
   *
   * @param plaintext - The raw message string.
   * @param roomKey - The 32-byte AES-256 room data key.
   * @returns Compact ciphertext string.
   */
  encryptMessage(plaintext: string, roomKey: Buffer): string {
    const { ciphertext, iv, tag } = encryptAesGcm(plaintext, roomKey);
    return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  /**
   * Decrypts a message content string using the room's data key.
   *
   * Strictly enforces encryption: if the content is not in `enc:v1:` format,
   * it throws an InternalServerErrorException, rejecting unencrypted plaintext.
   *
   * @param content - Compact ciphertext string (`enc:v1:<ivBase64>:<tagBase64>:<ciphertextBase64>`).
   * @param roomKey - The 32-byte AES-256 room data key.
   * @returns Decrypted plaintext string.
   * @throws {InternalServerErrorException} If content is unencrypted or malformed.
   */
  decryptMessage(content: string, roomKey: Buffer): string {
    if (!this.isEncryptedMessage(content)) {
      this.logger.error(
        'Attempted to decrypt unencrypted or malformed chat message payload',
        { step: 'decrypt_message' },
      );
      throw new InternalServerErrorException(
        'Unencrypted or malformed chat message payload',
      );
    }

    const parts = content.split(':');
    try {
      const iv = Buffer.from(parts[2], 'base64');
      const tag = Buffer.from(parts[3], 'base64');
      const ciphertext = Buffer.from(parts[4], 'base64');

      return decryptAesGcm(ciphertext, iv, tag, roomKey);
    } catch (err: unknown) {
      this.logger.error('Failed to decrypt message content', {
        step: 'decrypt_message',
        err: serializeError(err),
      });
      throw new InternalServerErrorException(
        'Failed to decrypt message content',
      );
    }
  }

  /**
   * Determines whether a given string is a valid compact encrypted message.
   *
   * @param value - The content string to test.
   * @returns True if value starts with `enc:v1:` and contains required parts.
   */
  isEncryptedMessage(value?: string | null): boolean {
    if (!value || typeof value !== 'string') {
      return false;
    }
    if (!value.startsWith('enc:v1:')) {
      return false;
    }
    const parts = value.split(':');
    return parts.length >= 5 && parts[2].length > 0 && parts[3].length > 0;
  }

  /**
   * Flushes the in-memory room key cache (useful for tests or security invalidations).
   */
  clearCache(): void {
    this.unwrappedRoomKeyCache.clear();
  }

  private getCacheKey(wrappedKey: string, keyId: string): string {
    return createHash('sha256').update(keyId).update(wrappedKey).digest('hex');
  }

  private getCachedUnwrappedKey(
    wrappedKey: string,
    keyId: string,
  ): Buffer | null {
    const cacheKey = this.getCacheKey(wrappedKey, keyId);
    const entry = this.unwrappedRoomKeyCache.get(cacheKey);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.unwrappedRoomKeyCache.delete(cacheKey);
      return null;
    }
    return entry.key;
  }

  private cacheUnwrappedKey(
    wrappedKey: string,
    keyId: string,
    plaintextKey: Buffer,
  ): void {
    if (this.unwrappedRoomKeyCache.size >= ChatCryptoService.MAX_CACHE_SIZE) {
      const oldestKey = Array.from(this.unwrappedRoomKeyCache.keys())[0];
      if (oldestKey) {
        this.unwrappedRoomKeyCache.delete(oldestKey);
      }
    }

    const cacheKey = this.getCacheKey(wrappedKey, keyId);
    this.unwrappedRoomKeyCache.set(cacheKey, {
      key: plaintextKey,
      expiresAt: Date.now() + ChatCryptoService.CACHE_TTL_MS,
    });
  }
}
