import { KeyManagementServiceClient } from '@google-cloud/kms';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { LoggerService } from '@core/logger';

import { CloudKmsKeyManager } from '../cloud-kms-key-manager.service';

const mockEncrypt = jest.fn();
const mockDecrypt = jest.fn();
const mockClose = jest.fn();

jest.mock('@google-cloud/kms', () => {
  return {
    KeyManagementServiceClient: jest.fn().mockImplementation(() => {
      return {
        encrypt: mockEncrypt,
        decrypt: mockDecrypt,
        close: mockClose,
      };
    }),
  };
});

describe('CloudKmsKeyManager', () => {
  let manager: CloudKmsKeyManager;
  let configServiceMock: jest.Mocked<ConfigService>;
  let loggerServiceMock: jest.Mocked<LoggerService>;

  const hmacKeyBase64 = Buffer.from('a'.repeat(32)).toString('base64');

  beforeEach(async () => {
    jest.clearAllMocks();

    configServiceMock = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'KMS_KEY_NAMES') {
          return JSON.stringify({
            'key-v1': 'projects/p/locations/l/keyRings/kr/cryptoKeys/key-v1',
          });
        }
        if (key === 'KMS_ACTIVE_KEY_ID') return 'key-v1';
        if (key === 'HMAC_KEY_BASE64') return hmacKeyBase64;
        return null;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        error: jest.fn(),
      }),
    } as unknown as jest.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudKmsKeyManager,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    manager = module.get<CloudKmsKeyManager>(CloudKmsKeyManager);
  });

  it('should be defined', () => {
    expect(manager).toBeDefined();
  });

  describe('wrapDataKey', () => {
    it('should successfully encrypt data key', async () => {
      mockEncrypt.mockResolvedValue([
        { ciphertext: Buffer.from('encrypted-data') },
      ]);

      const result = await manager.wrapDataKey(Buffer.from('plain-data'));

      expect(result.wrappedKey.toString()).toBe('encrypted-data');
      expect(result.keyId).toBe('key-v1');
      expect(mockEncrypt).toHaveBeenCalledWith({
        name: 'projects/p/locations/l/keyRings/kr/cryptoKeys/key-v1',
        plaintext: Buffer.from('plain-data'),
      });
    });
    it('should throw error when KMS encrypt returns no ciphertext', async () => {
      mockEncrypt.mockResolvedValue([{}]);

      await expect(
        manager.wrapDataKey(Buffer.from('plain-data')),
      ).rejects.toThrow('KMS encrypt returned no ciphertext');
    });
  });

  describe('unwrapDataKey', () => {
    it('should successfully decrypt data key', async () => {
      mockDecrypt.mockResolvedValue([
        { plaintext: Buffer.from('decrypted-data') },
      ]);

      const result = await manager.unwrapDataKey(
        Buffer.from('wrapped-data'),
        'key-v1',
      );

      expect(result.toString()).toBe('decrypted-data');
      expect(mockDecrypt).toHaveBeenCalledWith({
        name: 'projects/p/locations/l/keyRings/kr/cryptoKeys/key-v1',
        ciphertext: Buffer.from('wrapped-data'),
      });
    });

    it('should throw error when keyId is unknown', async () => {
      await expect(
        manager.unwrapDataKey(Buffer.from('wrapped-data'), 'unknown-key'),
      ).rejects.toThrow('Unknown keyId: unknown-key');
    });

    it('should throw error when KMS decrypt returns no plaintext', async () => {
      mockDecrypt.mockResolvedValue([{}]);

      await expect(
        manager.unwrapDataKey(Buffer.from('wrapped-data'), 'key-v1'),
      ).rejects.toThrow('KMS decrypt returned no plaintext');
    });
  });

  describe('computeHash', () => {
    it('should compute deterministic HMAC hash for input', async () => {
      const hash1 = await manager.computeHash('test-input');
      const hash2 = await manager.computeHash('test-input');
      const hash3 = await manager.computeHash('different-input');

      expect(typeof hash1).toBe('string');
      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });
  });

  describe('getCurrentKeyId', () => {
    it('should return the active key id', async () => {
      const keyId = await manager.getCurrentKeyId();
      expect(keyId).toBe('key-v1');
    });
  });

  describe('constructor validation', () => {
    it('should throw if KMS_KEY_NAMES is missing', () => {
      const config = {
        get: jest.fn((k: string) => {
          if (k === 'HMAC_KEY_BASE64') return hmacKeyBase64;
          return null;
        }),
      } as unknown as ConfigService;

      expect(
        () => new CloudKmsKeyManager(config, loggerServiceMock as any),
      ).toThrow('KMS_KEY_NAMES must be set');
    });

    it('should throw if KMS_KEY_NAMES is invalid JSON', () => {
      const config = {
        get: jest.fn((k: string) => {
          if (k === 'KMS_KEY_NAMES') return 'invalid-json';
          if (k === 'HMAC_KEY_BASE64') return hmacKeyBase64;
          return null;
        }),
      } as unknown as ConfigService;

      expect(
        () => new CloudKmsKeyManager(config, loggerServiceMock as any),
      ).toThrow('KMS_KEY_NAMES must be valid JSON');
    });

    it('should throw if KMS key name does not start with projects/', () => {
      const config = {
        get: jest.fn((k: string) => {
          if (k === 'KMS_KEY_NAMES')
            return JSON.stringify({ 'key-v1': 'invalid-kms-name' });
          if (k === 'HMAC_KEY_BASE64') return hmacKeyBase64;
          return null;
        }),
      } as unknown as ConfigService;

      expect(
        () => new CloudKmsKeyManager(config, loggerServiceMock as any),
      ).toThrow('Invalid KMS key name for key-v1');
    });

    it('should throw if active key ID is not found in KMS_KEY_NAMES', () => {
      const config = {
        get: jest.fn((k: string) => {
          if (k === 'KMS_KEY_NAMES')
            return JSON.stringify({
              'key-v2': 'projects/p/locations/l/keyRings/kr/cryptoKeys/key-v2',
            });
          if (k === 'KMS_ACTIVE_KEY_ID') return 'key-v1';
          if (k === 'HMAC_KEY_BASE64') return hmacKeyBase64;
          return null;
        }),
      } as unknown as ConfigService;

      expect(
        () => new CloudKmsKeyManager(config, loggerServiceMock as any),
      ).toThrow('Active key ID key-v1 not found in KMS_KEY_NAMES');
    });

    it('should throw if HMAC_KEY_BASE64 is missing', () => {
      const config = {
        get: jest.fn((k: string) => {
          if (k === 'KMS_KEY_NAMES')
            return JSON.stringify({
              'key-v1': 'projects/p/locations/l/keyRings/kr/cryptoKeys/key-v1',
            });
          if (k === 'KMS_ACTIVE_KEY_ID') return 'key-v1';
          return null;
        }),
      } as unknown as ConfigService;

      expect(
        () => new CloudKmsKeyManager(config, loggerServiceMock as any),
      ).toThrow('Missing HMAC_KEY_BASE64');
    });

    it('should throw if HMAC_KEY_BASE64 length is not 32 bytes', () => {
      const config = {
        get: jest.fn((k: string) => {
          if (k === 'KMS_KEY_NAMES')
            return JSON.stringify({
              'key-v1': 'projects/p/locations/l/keyRings/kr/cryptoKeys/key-v1',
            });
          if (k === 'KMS_ACTIVE_KEY_ID') return 'key-v1';
          if (k === 'HMAC_KEY_BASE64')
            return Buffer.from('short').toString('base64');
          return null;
        }),
      } as unknown as ConfigService;

      expect(
        () => new CloudKmsKeyManager(config, loggerServiceMock as any),
      ).toThrow('Invalid HMAC_KEY_BASE64 length (must be 32 bytes base64)');
    });
  });

  describe('onModuleDestroy', () => {
    it('should close KMS client connection', async () => {
      await manager.onModuleDestroy();
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
