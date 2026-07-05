import { createHmac } from 'crypto';

import { KeyManagementServiceClient } from '@google-cloud/kms';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { safeCloseClient } from '@common/utils/cleanup.utils';
import { ContextualLogger, LoggerService } from '@core/logger';

import { IKeyManager } from './key-manager.interface';

/**
 * CloudKmsKeyManager
 * ------------------
 * - Supports multiple active KMS keys for rotation.
 * - Each keyId corresponds to a specific GCP KMS key (or key version).
 * - Wrap/unwrap operations delegate to the correct keyId.
 * - Deterministic hashing uses a dedicated stable HMAC key (HMAC_KEY_BASE64),
 *   decoupled from encryption master keys.
 *
 * ENV EXAMPLE:
 *   KMS_KEY_NAMES={"key-v1":"projects/myproj/locations/asia-south1/keyRings/main/cryptoKeys/key-v1","key-v2":"projects/myproj/locations/asia-south1/keyRings/main/cryptoKeys/key-v2"}
 *   KMS_ACTIVE_KEY_ID=key-v2
 *   HMAC_KEY_BASE64=Jk2xB3VbWlM9LhXvO0xY...==
 */
@Injectable()
export class CloudKmsKeyManager implements IKeyManager, OnModuleDestroy {
  private readonly client = new KeyManagementServiceClient();
  private readonly kmsKeys: Map<string, string> = new Map(); // keyId → KMS key name
  private readonly activeKeyId: string;
  private readonly hmacKey: Buffer;
  private readonly logger: ContextualLogger;

  constructor(
    private readonly configService: ConfigService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.forContext(CloudKmsKeyManager.name);
    const kmsKeysJson = this.configService.get<string>('KMS_KEY_NAMES');
    const activeKeyId =
      this.configService.get<string>('KMS_ACTIVE_KEY_ID') ?? 'key-v1';

    if (!kmsKeysJson) {
      throw new Error(
        'KMS_KEY_NAMES must be set (JSON object of { keyId: kmsKeyName })',
      );
    }

    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(kmsKeysJson) as Record<string, string>;
    } catch {
      throw new Error('KMS_KEY_NAMES must be valid JSON');
    }

    for (const [keyId, kmsName] of Object.entries(parsed)) {
      if (!kmsName.startsWith('projects/')) {
        throw new Error(`Invalid KMS key name for ${keyId}: ${kmsName}`);
      }
      this.kmsKeys.set(keyId, kmsName);
    }

    if (!this.kmsKeys.has(activeKeyId)) {
      throw new Error(
        `Active key ID ${activeKeyId} not found in KMS_KEY_NAMES`,
      );
    }

    this.activeKeyId = activeKeyId;

    // ✅ Load the stable HMAC key (for deterministic hashing)
    const hmacKeyB64 = this.configService.get<string>('HMAC_KEY_BASE64');
    if (!hmacKeyB64) throw new Error('Missing HMAC_KEY_BASE64');
    this.hmacKey = Buffer.from(hmacKeyB64, 'base64');
    if (this.hmacKey.length !== 32) {
      throw new Error(
        'Invalid HMAC_KEY_BASE64 length (must be 32 bytes base64)',
      );
    }
  }

  async onModuleDestroy() {
    await safeCloseClient(this.client, this.logger, 'KMS');
  }

  /**
   * Encrypts (wraps) a data key using the currently active KMS key.
   */
  async wrapDataKey(
    plaintextKey: Buffer,
  ): Promise<{ wrappedKey: Buffer; keyId: string }> {
    const kmsKeyName = this.kmsKeys.get(this.activeKeyId)!;

    const [result] = await this.client.encrypt({
      name: kmsKeyName,
      plaintext: plaintextKey,
    });

    if (!result.ciphertext) {
      throw new Error('KMS encrypt returned no ciphertext');
    }

    const wrappedKey = Buffer.from(result.ciphertext as Buffer);
    return { wrappedKey, keyId: this.activeKeyId };
  }

  /**
   * Decrypts (unwraps) a data key using the correct KMS keyId.
   * Allows decrypting data encrypted with older keys.
   */
  async unwrapDataKey(wrappedKey: Buffer, keyId: string): Promise<Buffer> {
    const kmsKeyName = this.kmsKeys.get(keyId);
    if (!kmsKeyName) {
      throw new Error(`Unknown keyId: ${keyId}`);
    }

    const [result] = await this.client.decrypt({
      name: kmsKeyName,
      ciphertext: wrappedKey,
    });

    if (!result.plaintext) {
      throw new Error('KMS decrypt returned no plaintext');
    }

    return Buffer.from(result.plaintext as Buffer);
  }

  /**
   * Deterministic HMAC hash for stable lookups (e.g., account number, IFSC).
   * Uses dedicated stable key, independent of KMS master keys.
   */
  computeHash(input: string): Promise<string> {
    return Promise.resolve(
      createHmac('sha256', this.hmacKey).update(input, 'utf8').digest('hex'),
    );
  }

  /**
   * Returns the active keyId used for new encryptions.
   */
  getCurrentKeyId(): Promise<string> {
    return Promise.resolve(this.activeKeyId);
  }
}
