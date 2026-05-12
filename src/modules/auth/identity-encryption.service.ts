import { Inject, Injectable } from '@nestjs/common';
import { IdentityType } from '@prisma/client';
import {
  decryptAesGcm,
  encryptAesGcm,
  generateDataKey,
} from 'src/core/crypto/crypto-utils';
import type { IKeyManager } from 'src/core/kms/key-manager.interface';

export interface EncryptedValue {
  ciphertextBase64: string;
  ivBase64: string;
  tagBase64: string;
  wrappedKeyBase64: string;
  keyId: string;
}

@Injectable()
export class IdentityEncryptionService {
  constructor(
    @Inject('KEY_MANAGER') private readonly keyManager: IKeyManager,
  ) {}

  /**
   * Encrypt a public value (phone number, email, social handle).
   * Returns the encrypted fields plus a masked version for display.
   */
  async encryptPublicValue(
    value: string,
  ): Promise<EncryptedValue> {
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

  /**
   * Encrypt a platform ID (e.g., numeric Instagram user ID).
   * No masking is needed for platform IDs.
   */
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
    return this.decryptValue(ciphertextBase64, ivBase64, tagBase64, wrappedKeyBase64, keyId);
  }

  async decryptPlatformId(
    ciphertextBase64: string,
    ivBase64: string,
    tagBase64: string,
    wrappedKeyBase64: string,
    keyId: string,
  ): Promise<string> {
    return this.decryptValue(ciphertextBase64, ivBase64, tagBase64, wrappedKeyBase64, keyId);
  }

  /**
   * Compute HMAC-SHA256 hash for deterministic lookups.
   */
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
    // For social handles, just mask all but first character (or return a fixed mask)
    return value.charAt(0) + '••••' + value.slice(-2);
  }

  private maskPhone(phone: string): string {
    // Show country code and last 4 digits, mask rest
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length <= 4) return '••••';
    return '+' + cleaned.slice(0, cleaned.length - 4).replace(/\d/g, '•') + cleaned.slice(-4);
  }

  private maskEmail(email: string): string {
    const [name, domain] = email.split('@');
    if (!domain) return '••••';
    const maskedName = name.charAt(0) + '••••' + name.charAt(name.length - 1);
    return `${maskedName}@${domain}`;
  }
}