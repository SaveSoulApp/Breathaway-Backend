import { normalizeIdentityValue } from '@common/utils/identity.utils';
import {
  decryptAesGcm,
  encryptAesGcm,
  generateDataKey,
} from '@core/crypto/crypto.utils';
import type { IKeyManager } from '@core/kms/key-manager.interface';
import { Inject, Injectable } from '@nestjs/common';
import { IdentityType } from '@prisma/client';

export interface EncryptedValue {
  ciphertextBase64: string;
  ivBase64: string;
  tagBase64: string;
  wrappedKeyBase64: string;
  keyId: string;
}

@Injectable()
export class IdentityCryptoService {
  constructor(
    @Inject('KEY_MANAGER') private readonly keyManager: IKeyManager,
  ) {}

  public async processPublicValue(value: string, type: IdentityType) {
    const normalized = normalizeIdentityValue(value, type);
    const hash = await this.computeHash(normalized);
    const encryptedPublicValue = await this.encryptPublicValue(normalized);
    const masked = this.maskPublicValue(normalized, type);

    return {
      publicValueHash: hash,
      publicValueCiphertext: encryptedPublicValue.ciphertextBase64,
      publicValueIv: encryptedPublicValue.ivBase64,
      publicValueTag: encryptedPublicValue.tagBase64,
      publicValueWrappedKey: encryptedPublicValue.wrappedKeyBase64,
      publicValueKeyId: encryptedPublicValue.keyId,
      publicValueMasked: masked,
    };
  }

  public async processPlatformId(platformId: string) {
    const hash = await this.computeHash(platformId);
    const encryptedPlatformId = await this.encryptPlatformId(platformId);

    return {
      platformIdHash: hash,
      platformIdCiphertext: encryptedPlatformId.ciphertextBase64,
      platformIdIv: encryptedPlatformId.ivBase64,
      platformIdTag: encryptedPlatformId.tagBase64,
      platformIdWrappedKey: encryptedPlatformId.wrappedKeyBase64,
      platformIdKeyId: encryptedPlatformId.keyId,
    };
  }

  async encryptPublicValue(value: string): Promise<EncryptedValue> {
    const dataKey = generateDataKey();
    const { wrappedKey, keyId } = await this.keyManager.wrapDataKey(dataKey);
    const { ciphertext, iv, tag } = encryptAesGcm(value, dataKey);

    return {
      ciphertextBase64: ciphertext.toString('base64'),
      ivBase64: iv.toString('base64'),
      tagBase64: tag.toString('base64'),
      wrappedKeyBase64: wrappedKey.toString('base64'),
      keyId,
    };
  }

  async encryptPlatformId(platformId: string): Promise<EncryptedValue> {
    const dataKey = generateDataKey();
    const { wrappedKey, keyId } = await this.keyManager.wrapDataKey(dataKey);
    const { ciphertext, iv, tag } = encryptAesGcm(platformId, dataKey);

    return {
      ciphertextBase64: ciphertext.toString('base64'),
      ivBase64: iv.toString('base64'),
      tagBase64: tag.toString('base64'),
      wrappedKeyBase64: wrappedKey.toString('base64'),
      keyId,
    };
  }

  private async decryptValue(
    ciphertextBase64: string,
    ivBase64: string,
    tagBase64: string,
    wrappedKeyBase64: string,
    keyId: string,
  ): Promise<string> {
    const wrapped = Buffer.from(wrappedKeyBase64, 'base64');
    const dataKey = await this.keyManager.unwrapDataKey(wrapped, keyId);
    return decryptAesGcm(
      Buffer.from(ciphertextBase64, 'base64'),
      Buffer.from(ivBase64, 'base64'),
      Buffer.from(tagBase64, 'base64'),
      dataKey,
    );
  }

  async decryptPublicValue(
    ciphertextBase64: string,
    ivBase64: string,
    tagBase64: string,
    wrappedKeyBase64: string,
    keyId: string,
  ): Promise<string> {
    return this.decryptValue(
      ciphertextBase64,
      ivBase64,
      tagBase64,
      wrappedKeyBase64,
      keyId,
    );
  }

  async decryptPlatformId(
    ciphertextBase64: string,
    ivBase64: string,
    tagBase64: string,
    wrappedKeyBase64: string,
    keyId: string,
  ): Promise<string> {
    return this.decryptValue(
      ciphertextBase64,
      ivBase64,
      tagBase64,
      wrappedKeyBase64,
      keyId,
    );
  }

  async computeHash(input: string): Promise<string> {
    return this.keyManager.computeHash(input);
  }

  maskPublicValue(value: string, type: IdentityType): string {
    if (type === IdentityType.PHONE) {
      return this.maskPhone(value);
    }
    if (type === IdentityType.EMAIL) {
      return this.maskEmail(value);
    }
    return value.charAt(0) + '••••' + value.slice(-2);
  }

  private maskPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length <= 4) return '••••';
    return (
      '+' +
      cleaned.slice(0, cleaned.length - 4).replace(/\d/g, '•') +
      cleaned.slice(-4)
    );
  }

  private maskEmail(email: string): string {
    const [name, domain] = email.split('@');
    if (!domain) return '••••';
    const maskedName = name.charAt(0) + '••••' + name.charAt(name.length - 1);
    return `${maskedName}@${domain}`;
  }
}
