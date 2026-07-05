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
  });

  describe('onModuleDestroy', () => {
    it('should close KMS client connection', async () => {
      await manager.onModuleDestroy();
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
