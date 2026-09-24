import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

import { GcpSecretsKeyManager } from '../gcp-secrets-key-manager.service';

describe('GcpSecretsKeyManager', () => {
  const masterKeyV1 = randomBytes(32);
  const masterKeyV2 = randomBytes(32);
  const hmacKey = randomBytes(32);

  const validMasterKeysJson = JSON.stringify({
    'key-v1': masterKeyV1.toString('base64'),
    'key-v2': masterKeyV2.toString('base64'),
  });

  const createConfigService = (overrides: Record<string, any> = {}) => {
    const configMap: Record<string, any> = {
      GCP_SECRET_MASTER_KEYS: validMasterKeysJson,
      ACTIVE_MASTER_KEY_ID: 'key-v1',
      HMAC_KEY_BASE64: hmacKey.toString('base64'),
      ...overrides,
    };

    return {
      get: jest.fn((key: string) => configMap[key]),
      getOrThrow: jest.fn((key: string) => {
        if (configMap[key] !== undefined) return configMap[key];
        throw new Error(`Missing config: ${key}`);
      }),
    } as unknown as ConfigService;
  };

  describe('constructor initialization and validation', () => {
    it('should initialize successfully with valid configuration', () => {
      const configService = createConfigService();
      const manager = new GcpSecretsKeyManager(configService);

      expect(manager).toBeDefined();
    });

    it('should throw an error when GCP_SECRET_MASTER_KEYS contains invalid JSON', () => {
      const configService = createConfigService({
        GCP_SECRET_MASTER_KEYS: 'invalid-json{',
      });

      expect(() => new GcpSecretsKeyManager(configService)).toThrow(
        /Invalid JSON in GCP_SECRET_MASTER_KEYS/,
      );
    });

    it('should throw an error when a master key is not 32 bytes', () => {
      const invalidKeysJson = JSON.stringify({
        'key-v1': Buffer.from('short-key').toString('base64'),
      });
      const configService = createConfigService({
        GCP_SECRET_MASTER_KEYS: invalidKeysJson,
      });

      expect(() => new GcpSecretsKeyManager(configService)).toThrow(
        /Invalid key length for key-v1/,
      );
    });

    it('should throw an error when active key is not in master keys', () => {
      const configService = createConfigService({
        ACTIVE_MASTER_KEY_ID: 'key-non-existent',
      });

      expect(() => new GcpSecretsKeyManager(configService)).toThrow(
        /Active key key-non-existent not found/,
      );
    });

    it('should throw an error when HMAC_KEY_BASE64 is missing', () => {
      const configService = createConfigService({
        HMAC_KEY_BASE64: undefined,
      });

      expect(() => new GcpSecretsKeyManager(configService)).toThrow(
        /Missing HMAC_KEY_BASE64/,
      );
    });

    it('should throw an error when HMAC_KEY_BASE64 length is not 32 bytes', () => {
      const configService = createConfigService({
        HMAC_KEY_BASE64: Buffer.from('short-hmac').toString('base64'),
      });

      expect(() => new GcpSecretsKeyManager(configService)).toThrow(
        /Invalid HMAC_KEY_BASE64 length/,
      );
    });
  });

  describe('wrapDataKey and unwrapDataKey', () => {
    it('should wrap a data key and successfully unwrap it back to plaintext', async () => {
      // Arrange
      const configService = createConfigService();
      const manager = new GcpSecretsKeyManager(configService);
      const plaintextKey = randomBytes(32);

      // Act
      const { wrappedKey, keyId } = await manager.wrapDataKey(plaintextKey);
      const unwrappedKey = await manager.unwrapDataKey(wrappedKey, keyId);

      // Assert
      expect(keyId).toBe('key-v1');
      expect(wrappedKey.length).toBe(12 + 16 + 32); // IV (12) + Tag (16) + Ciphertext (32)
      expect(unwrappedKey).toEqual(plaintextKey);
    });

    it('should support wrapping with another active key version', async () => {
      // Arrange
      const configService = createConfigService({
        ACTIVE_MASTER_KEY_ID: 'key-v2',
      });
      const manager = new GcpSecretsKeyManager(configService);
      const plaintextKey = randomBytes(32);

      // Act
      const { wrappedKey, keyId } = await manager.wrapDataKey(plaintextKey);
      const unwrappedKey = await manager.unwrapDataKey(wrappedKey, keyId);

      // Assert
      expect(keyId).toBe('key-v2');
      expect(unwrappedKey).toEqual(plaintextKey);
    });

    it('should throw an error when unwrapping with an unknown keyId', () => {
      // Arrange
      const configService = createConfigService();
      const manager = new GcpSecretsKeyManager(configService);
      const wrappedKey = randomBytes(60);

      // Act & Assert
      expect(() => manager.unwrapDataKey(wrappedKey, 'unknown-id')).toThrow(
        /Unknown keyId: unknown-id/,
      );
    });

    it('should throw an authentication error if wrapped data is tampered with', async () => {
      // Arrange
      const configService = createConfigService();
      const manager = new GcpSecretsKeyManager(configService);
      const plaintextKey = randomBytes(32);
      const { wrappedKey, keyId } = await manager.wrapDataKey(plaintextKey);

      // Tamper with ciphertext
      wrappedKey[wrappedKey.length - 1] ^= 1;

      // Act & Assert
      expect(() => manager.unwrapDataKey(wrappedKey, keyId)).toThrow();
    });
  });

  describe('computeHash', () => {
    it('should deterministically compute HMAC-SHA256 hex string', async () => {
      // Arrange
      const configService = createConfigService();
      const manager = new GcpSecretsKeyManager(configService);
      const input = 'sensitive-phone-number-12345';

      // Act
      const hash1 = await manager.computeHash(input);
      const hash2 = await manager.computeHash(input);

      // Assert
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex length
    });

    it('should produce different hashes for different inputs', async () => {
      // Arrange
      const configService = createConfigService();
      const manager = new GcpSecretsKeyManager(configService);

      // Act
      const hashA = await manager.computeHash('input-A');
      const hashB = await manager.computeHash('input-B');

      // Assert
      expect(hashA).not.toBe(hashB);
    });
  });

  describe('getCurrentKeyId', () => {
    it('should return the active master key ID', async () => {
      // Arrange
      const configService = createConfigService({
        ACTIVE_MASTER_KEY_ID: 'key-v2',
      });
      const manager = new GcpSecretsKeyManager(configService);

      // Act
      const currentKeyId = await manager.getCurrentKeyId();

      // Assert
      expect(currentKeyId).toBe('key-v2');
    });
  });
});
