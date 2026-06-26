import { PlatformId, PublicValue } from '@common/interfaces';
import { normalizeIdentityValue } from '@common/utils/identity.utils';
import { BaseService } from '@core/base';
import {
  decryptAesGcm,
  encryptAesGcm,
  generateDataKey,
} from '@core/crypto/crypto.utils';
import type { IKeyManager } from '@core/kms/key-manager.interface';
import { LoggerService } from '@core/logger';
import { Inject, Injectable } from '@nestjs/common';
import { IdentityType } from '@prisma/client';

export interface EncryptedValue {
  ciphertextBase64: string;
  ivBase64: string;
  tagBase64: string;
  wrappedKeyBase64: string;
  keyId: string;
}

/**
 * Orchestrates cryptographic operations for sensitive user identity data (PII).
 *
 * Handles envelope encryption by coordinating AES-GCM data encryption with the KMS key manager,
 * generating blinded hashes for exact-match querying, and creating safe, masked representations
 * for logging or UI display.
 */
@Injectable()
export class IdentityCryptoService extends BaseService {
  constructor(
    logger: LoggerService,
    @Inject('KEY_MANAGER') private readonly keyManager: IKeyManager,
  ) {
    super(logger);
  }

  /**
   * Encrypts, hashes, and masks a public identity value (like an email or phone number).
   *
   * Normalizes the input before processing to ensure deterministic hashes. The resulting payload
   * contains everything needed to store the encrypted value securely and query it via the blinded hash.
   *
   * @param value - The raw identity value to process (e.g., "john.doe@example.com").
   * @param type - The type of identity, used to determine normalization and masking rules.
   * @returns An object containing the ciphertext, IV, authentication tag, wrapped data key, KMS key ID, deterministic hash, and a masked string.
   */
  public async processPublicValue(
    value: string,
    type: IdentityType,
  ): Promise<PublicValue> {
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

  /**
   * Encrypts and hashes a platform identifier (like an Apple or Google OAuth ID).
   *
   * Normalizes the ID to lowercase and trims whitespace to ensure consistent hashing for lookups.
   *
   * @param platformId - The raw third-party platform identifier.
   * @returns An object containing the ciphertext, IV, authentication tag, wrapped data key, KMS key ID, and deterministic hash.
   */
  public async processPlatformId(platformId: string): Promise<PlatformId> {
    const normalizedPlatformId = platformId.trim().toLowerCase();
    const hash = await this.computeHash(normalizedPlatformId);
    const encryptedPlatformId =
      await this.encryptPlatformId(normalizedPlatformId);

    return {
      platformIdHash: hash,
      platformIdCiphertext: encryptedPlatformId.ciphertextBase64,
      platformIdIv: encryptedPlatformId.ivBase64,
      platformIdTag: encryptedPlatformId.tagBase64,
      platformIdWrappedKey: encryptedPlatformId.wrappedKeyBase64,
      platformIdKeyId: encryptedPlatformId.keyId,
    };
  }

  /**
   * Encrypts a plaintext string using AES-GCM envelope encryption.
   *
   * Generates a unique ephemeral data key, encrypts the data, and then wraps the data key
   * using the injected KMS provider.
   *
   * @param value - The plaintext string to encrypt.
   * @returns The ciphertext and GCM parameters alongside the KMS-wrapped data key.
   */
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

  /**
   * Encrypts a platform ID using AES-GCM envelope encryption.
   *
   * Functions identically to `encryptPublicValue`, generating a fresh data key
   * and wrapping it via KMS.
   *
   * @param platformId - The plaintext platform ID to encrypt.
   * @returns The ciphertext and GCM parameters alongside the KMS-wrapped data key.
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

  /**
   * Decrypts an encrypted public identity value back to its original plaintext.
   *
   * Unwraps the encrypted data key via KMS and uses it to decrypt the AES-GCM ciphertext.
   *
   * @param data - The encrypted payload excluding hash and masked values.
   * @returns The original normalized plaintext identity value.
   * @throws {Error} When decryption fails (e.g., tampered ciphertext, invalid tag, or KMS unwrapping error).
   */
  async decryptPublicValue(
    data: Omit<PublicValue, 'publicValueHash' | 'publicValueMasked'>,
  ): Promise<string> {
    return this.decryptValue(
      data.publicValueCiphertext,
      data.publicValueIv,
      data.publicValueTag,
      data.publicValueWrappedKey,
      data.publicValueKeyId,
    );
  }

  /**
   * Decrypts an encrypted platform ID back to its original plaintext.
   *
   * Uses the KMS provider to unwrap the data key before performing AES-GCM decryption.
   *
   * @param data - The encrypted platform ID payload excluding the hash.
   * @returns The original normalized plaintext platform ID.
   * @throws {Error} When decryption fails (e.g., tampered ciphertext, invalid tag, or KMS unwrapping error).
   */
  async decryptPlatformId(
    data: Omit<PlatformId, 'platformIdHash'>,
  ): Promise<string> {
    return this.decryptValue(
      data.platformIdCiphertext,
      data.platformIdIv,
      data.platformIdTag,
      data.platformIdWrappedKey,
      data.platformIdKeyId,
    );
  }

  /**
   * Computes a deterministic, blinded hash of the input string for secure lookups.
   *
   * Delegates the hashing mechanism to the KMS provider, which typically uses HMAC with a secret key
   * to prevent offline rainbow table attacks on the hashes.
   *
   * @param input - The normalized plaintext string to hash.
   * @returns The resulting hash string (typically Base64 or Hex encoded).
   */
  async computeHash(input: string): Promise<string> {
    return this.keyManager.computeHash(input);
  }

  /**
   * Generates a safe, partially obfuscated version of an identity value for display or logging.
   *
   * Applies type-specific formatting (e.g., hiding most characters of an email or phone number)
   * while leaving enough information for user recognition or support debugging.
   *
   * @param value - The raw identity value to mask.
   * @param type - The type of identity, dictating which masking algorithm to apply.
   * @returns A partially redacted string (e.g., "j••••e@example.com").
   */
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
    if (cleaned.length <= 6) return '****';
    return `+${cleaned.slice(0, 2)}****${cleaned.slice(-4)}`;
  }

  private maskEmail(email: string): string {
    const [name, domain] = email.split('@');
    if (!domain) return '••••';
    const maskedName = name.charAt(0) + '••••' + name.charAt(name.length - 1);
    return `${maskedName}@${domain}`;
  }
}
