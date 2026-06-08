import { EventEmitter2 } from '@nestjs/event-emitter';
import { IdentityCryptoService } from './identity-crypto.service';
import { LoggerService } from '@core/logger';
import { IKeyManager } from '@core/kms/key-manager.interface';
import { IdentityType } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import * as cryptoUtils from '@core/crypto/crypto.utils';

jest.mock('@core/crypto/crypto.utils', () => ({
  generateDataKey: jest.fn(),
  encryptAesGcm: jest.fn(),
  decryptAesGcm: jest.fn(),
}));

describe('IdentityCryptoService', () => {
  let service: IdentityCryptoService;
  let keyManager: jest.Mocked<IKeyManager>;
  let loggerService: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    loggerService = {
      forContext: jest.fn().mockReturnThis(),
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    keyManager = {
      wrapDataKey: jest.fn(),
      unwrapDataKey: jest.fn(),
      computeHash: jest.fn(),
      getCurrentKeyId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        IdentityCryptoService,
        { provide: LoggerService, useValue: loggerService },
        { provide: 'KEY_MANAGER', useValue: keyManager },
      ],
    }).compile();

    service = module.get<IdentityCryptoService>(IdentityCryptoService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('maskPublicValue', () => {
    it('should mask phone number correctly preserving first 2 and last 4 digits', () => {
      const masked = service.maskPublicValue(
        '+919876543210',
        IdentityType.PHONE,
      );
      expect(masked).toBe('+91****3210');
    });

    it('should mask short phone number with asterisks', () => {
      const masked = service.maskPublicValue('123456', IdentityType.PHONE);
      expect(masked).toBe('****');
    });

    it('should mask email correctly', () => {
      const masked = service.maskPublicValue(
        'testuser@example.com',
        IdentityType.EMAIL,
      );
      expect(masked).toBe('t••••r@example.com');
    });

    it('should handle email without domain gracefully', () => {
      const masked = service.maskPublicValue('testuser', IdentityType.EMAIL);
      expect(masked).toBe('••••');
    });

    it('should mask generic string correctly', () => {
      const masked = service.maskPublicValue(
        'genericvalue',
        'UNKNOWN' as unknown as IdentityType,
      );
      expect(masked).toBe('g••••ue');
    });
  });

  describe('encryptPublicValue', () => {
    it('should encrypt public value and return expected structure', async () => {
      const fakeDataKey = Buffer.from('data-key');
      const fakeWrappedKey = Buffer.from('wrapped-key');
      const fakeCiphertext = Buffer.from('ciphertext');
      const fakeIv = Buffer.from('iv');
      const fakeTag = Buffer.from('tag');

      (cryptoUtils.generateDataKey as jest.Mock).mockReturnValue(fakeDataKey);
      keyManager.wrapDataKey.mockResolvedValue({
        wrappedKey: fakeWrappedKey,
        keyId: 'test-key-id',
      });
      (cryptoUtils.encryptAesGcm as jest.Mock).mockReturnValue({
        ciphertext: fakeCiphertext,
        iv: fakeIv,
        tag: fakeTag,
      });

      const result = await service.encryptPublicValue('test-value');

      expect(result).toEqual({
        ciphertextBase64: fakeCiphertext.toString('base64'),
        ivBase64: fakeIv.toString('base64'),
        tagBase64: fakeTag.toString('base64'),
        wrappedKeyBase64: fakeWrappedKey.toString('base64'),
        keyId: 'test-key-id',
      });

      expect(cryptoUtils.generateDataKey).toHaveBeenCalled();
      expect(keyManager.wrapDataKey).toHaveBeenCalledWith(fakeDataKey);
      expect(cryptoUtils.encryptAesGcm).toHaveBeenCalledWith(
        'test-value',
        fakeDataKey,
      );
    });
  });

  describe('decryptPublicValue', () => {
    it('should decrypt public value correctly', async () => {
      const fakeDataKey = Buffer.from('data-key');

      keyManager.unwrapDataKey.mockResolvedValue(fakeDataKey);
      (cryptoUtils.decryptAesGcm as jest.Mock).mockReturnValue(
        'decrypted-value',
      );

      const data = {
        publicValueCiphertext: Buffer.from('ciphertext').toString('base64'),
        publicValueIv: Buffer.from('iv').toString('base64'),
        publicValueTag: Buffer.from('tag').toString('base64'),
        publicValueWrappedKey: Buffer.from('wrapped-key').toString('base64'),
        publicValueKeyId: 'test-key-id',
      };

      const result = await service.decryptPublicValue(
        data as unknown as Parameters<typeof service.decryptPublicValue>[0],
      );

      expect(result).toBe('decrypted-value');
      expect(keyManager.unwrapDataKey).toHaveBeenCalledWith(
        Buffer.from(data.publicValueWrappedKey, 'base64'),
        data.publicValueKeyId,
      );
      expect(cryptoUtils.decryptAesGcm).toHaveBeenCalledWith(
        Buffer.from(data.publicValueCiphertext, 'base64'),
        Buffer.from(data.publicValueIv, 'base64'),
        Buffer.from(data.publicValueTag, 'base64'),
        fakeDataKey,
      );
    });
  });

  describe('processPublicValue', () => {
    it('should process public value returning hash, ciphertext, and masked value', async () => {
      keyManager.computeHash.mockResolvedValue('fake-hash');

      jest.spyOn(service, 'encryptPublicValue').mockResolvedValue({
        ciphertextBase64: 'cipher',
        ivBase64: 'iv',
        tagBase64: 'tag',
        wrappedKeyBase64: 'wrapped',
        keyId: 'key-id',
      });

      const result = await service.processPublicValue(
        ' TEST@example.com ',
        IdentityType.EMAIL,
      );

      expect(result).toEqual({
        publicValueHash: 'fake-hash',
        publicValueCiphertext: 'cipher',
        publicValueIv: 'iv',
        publicValueTag: 'tag',
        publicValueWrappedKey: 'wrapped',
        publicValueKeyId: 'key-id',
        publicValueMasked: 't••••t@example.com',
      });
      expect(keyManager.computeHash).toHaveBeenCalledWith('test@example.com');
      expect(service.encryptPublicValue).toHaveBeenCalledWith(
        'test@example.com',
      );
    });
  });

  describe('processPlatformId', () => {
    it('should process platform id returning hash and ciphertext structure', async () => {
      keyManager.computeHash.mockResolvedValue('fake-hash');

      jest.spyOn(service, 'encryptPlatformId').mockResolvedValue({
        ciphertextBase64: 'cipher',
        ivBase64: 'iv',
        tagBase64: 'tag',
        wrappedKeyBase64: 'wrapped',
        keyId: 'key-id',
      });

      const result = await service.processPlatformId(' PLATFORM-ID-123 ');

      expect(result).toEqual({
        platformIdHash: 'fake-hash',
        platformIdCiphertext: 'cipher',
        platformIdIv: 'iv',
        platformIdTag: 'tag',
        platformIdWrappedKey: 'wrapped',
        platformIdKeyId: 'key-id',
      });
      expect(keyManager.computeHash).toHaveBeenCalledWith('platform-id-123');
      expect(service.encryptPlatformId).toHaveBeenCalledWith('platform-id-123');
    });
  });

  describe('encryptPlatformId', () => {
    it('should encrypt platform id correctly', async () => {
      const fakeDataKey = Buffer.from('data-key');
      const fakeWrappedKey = Buffer.from('wrapped-key');
      const fakeCiphertext = Buffer.from('ciphertext');
      const fakeIv = Buffer.from('iv');
      const fakeTag = Buffer.from('tag');

      (cryptoUtils.generateDataKey as jest.Mock).mockReturnValue(fakeDataKey);
      keyManager.wrapDataKey.mockResolvedValue({
        wrappedKey: fakeWrappedKey,
        keyId: 'test-key-id',
      });
      (cryptoUtils.encryptAesGcm as jest.Mock).mockReturnValue({
        ciphertext: fakeCiphertext,
        iv: fakeIv,
        tag: fakeTag,
      });

      const result = await service.encryptPlatformId('platform-id');

      expect(result).toEqual({
        ciphertextBase64: fakeCiphertext.toString('base64'),
        ivBase64: fakeIv.toString('base64'),
        tagBase64: fakeTag.toString('base64'),
        wrappedKeyBase64: fakeWrappedKey.toString('base64'),
        keyId: 'test-key-id',
      });
    });
  });

  describe('decryptPlatformId', () => {
    it('should decrypt platform id correctly', async () => {
      const fakeDataKey = Buffer.from('data-key');

      keyManager.unwrapDataKey.mockResolvedValue(fakeDataKey);
      (cryptoUtils.decryptAesGcm as jest.Mock).mockReturnValue(
        'decrypted-platform-id',
      );

      const data = {
        platformIdCiphertext: Buffer.from('ciphertext').toString('base64'),
        platformIdIv: Buffer.from('iv').toString('base64'),
        platformIdTag: Buffer.from('tag').toString('base64'),
        platformIdWrappedKey: Buffer.from('wrapped-key').toString('base64'),
        platformIdKeyId: 'test-key-id',
      };

      const result = await service.decryptPlatformId(
        data as unknown as Parameters<typeof service.decryptPlatformId>[0],
      );

      expect(result).toBe('decrypted-platform-id');
    });
  });

  describe('computeHash', () => {
    it('should compute hash using key manager', async () => {
      keyManager.computeHash.mockResolvedValue('computed-hash');
      const result = await service.computeHash('input-string');
      expect(result).toBe('computed-hash');
      expect(keyManager.computeHash).toHaveBeenCalledWith('input-string');
    });
  });
});
