import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';
import { IKeyManager } from './key-manager.interface';

/**
 * GCP Secrets Key Management Service
 *
 * This service implements cryptographic key management for secure data encryption
 * in financial applications. It handles master key loading, data key wrapping/unwrapping,
 * and secure hashing operations.
 *
 * SECURITY ARCHITECTURE:
 * - Uses a two-layer key hierarchy: Master Keys (long-term) and Data Keys (short-term)
 * - Master Keys are loaded from GCP Secrets Manager or environment variables
 * - Data Keys are randomly generated per encryption operation and wrapped with Master Keys
 * - Supports key rotation through multiple master key versions
 * - Implements authenticated encryption (AES-256-GCM) for key wrapping
 * - Uses HMAC-SHA256 for deterministic hashing of sensitive data
 *
 * KEY MANAGEMENT FEATURES:
 * - Multiple master key support with active key designation
 * - Secure key wrapping/unwrapping using AES-256-GCM
 * - Deterministic hashing for duplicate detection without exposing plaintext
 * - Flexible key sourcing (single JSON secret or multiple environment variables)
 *
 * @implements {IKeyManager}
 */
@Injectable()
export class GcpSecretsKeyManager implements IKeyManager {
  /**
   * Map of available master keys for encryption/decryption operations
   * Format: keyId -> masterKey (32-byte Buffer)
   * This enables key rotation by maintaining multiple key versions
   */
  private readonly masterKeys: Map<string, Buffer> = new Map();

  /**
   * HMAC key used for computing secure hashes of sensitive data
   * Used for duplicate detection without storing plaintext values
   */
  private readonly hmacKey: Buffer;

  /**
   * Identifier for the currently active master key
   * All new encryptions will use this key version
   */
  private readonly activeKeyId: string;

  constructor(private readonly configService: ConfigService) {
    // Initialize master keys from configuration sources
    this.extractMasterKeys();

    // Determine which master key is currently active for encryption
    this.activeKeyId =
      this.configService.get<string>('ACTIVE_MASTER_KEY_ID') ?? 'key-v1';

    // Validate that the active key exists in our key store
    if (!this.masterKeys.has(this.activeKeyId)) {
      throw new Error(`Active key ${this.activeKeyId} not found`);
    }

    // Load and validate HMAC key for secure hashing operations
    const hmacKeyB64 = this.configService.get<string>('HMAC_KEY_BASE64');
    if (!hmacKeyB64) throw new Error('Missing HMAC_KEY_BASE64');
    this.hmacKey = Buffer.from(hmacKeyB64, 'base64');

    // HMAC key must be 32 bytes (256 bits) for optimal security
    if (this.hmacKey.length !== 32)
      throw new Error('Invalid HMAC_KEY_BASE64 length');
  }

  /**
   * Extracts master keys from configuration sources with fallback support
   *
   * LOADING PRIORITY:
   * 1. Primary: Single JSON secret containing all master keys (GCP_SECRET_MASTER_KEYS)
   * 2. Fallback: Multiple environment variables prefixed with 'MASTER_KEY_'
   *
   * KEY FORMAT REQUIREMENTS:
   * - All keys must be Base64 encoded
   * - Each key must be exactly 32 bytes (256 bits) when decoded
   * - Key IDs should be descriptive (e.g., 'key-v1', 'key-v2')
   *
   * @throws {Error} When keys are malformed or have invalid lengths
   */
  private extractMasterKeys() {
    // Option 1: Load from single JSON secret (preferred for GCP Secrets Manager)
    const allKeysJson = this.configService.get<string>(
      'GCP_SECRET_MASTER_KEYS',
    );

    if (allKeysJson) {
      try {
        const parsed = JSON.parse(allKeysJson) as Record<string, string>;
        for (const [keyId, base64] of Object.entries(parsed)) {
          const key = Buffer.from(base64, 'base64');
          // Validate key length to ensure cryptographic strength
          if (key.length !== 32)
            throw new Error(`Invalid key length for ${keyId}`);
          this.masterKeys.set(keyId, key);
        }
      } catch (err) {
        throw new Error(
          `Invalid JSON in GCP_SECRET_MASTER_KEYS: ${(err as Error).message}`,
        );
      }
    } else {
      // Option 2: Load from multiple environment variables (fallback for local development)
      for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith('MASTER_KEY_')) {
          // Convert env var name to key ID (e.g., 'MASTER_KEY_V1' -> 'key-v1')
          const keyId = key.replace('MASTER_KEY_', 'key-').toLowerCase();
          const buf = Buffer.from(value!, 'base64');
          if (buf.length === 32) this.masterKeys.set(keyId, buf);
        }
      }
    }
  }

  /**
   * Wraps (encrypts) a data key using the active master key
   *
   * ENCRYPTION PROCESS:
   * 1. Uses AES-256-GCM authenticated encryption mode
   * 2. Generates random 12-byte IV for each operation
   * 3. Encrypts the plaintext data key
   * 4. Returns IV, authentication tag, and ciphertext concatenated
   *
   * OUTPUT FORMAT:
   * [12-byte IV][16-byte Auth Tag][32-byte Ciphertext] = 60-byte wrapped key
   *
   * @param plaintextKey - The data key to encrypt (typically 32 bytes)
   * @returns Object containing wrapped key and key ID for later retrieval
   * @throws {Error} If active master key is not available
   */
  async wrapDataKey(
    plaintextKey: Buffer,
  ): Promise<{ wrappedKey: Buffer; keyId: string }> {
    const masterKey = this.masterKeys.get(this.activeKeyId)!;
    const iv = randomBytes(12); // 96-bit IV for GCM mode
    const cipher = createCipheriv('aes-256-gcm', masterKey, iv);

    // Encrypt the data key
    const ciphertext = Buffer.concat([
      cipher.update(plaintextKey),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag(); // 128-bit authentication tag

    // Concatenate IV, tag, and ciphertext for storage
    return {
      wrappedKey: Buffer.concat([iv, tag, ciphertext]),
      keyId: this.activeKeyId,
    };
  }

  /**
   * Unwraps (decrypts) a data key using the specified master key
   *
   * DECRYPTION PROCESS:
   * 1. Extracts IV, auth tag, and ciphertext from wrapped key
   * 2. Uses AES-256-GCM to decrypt and verify integrity
   * 3. Returns original plaintext data key
   *
   * SECURITY NOTES:
   * - Authentication tag verification prevents tampering
   * - Throws error if keyId doesn't exist or decryption fails
   *
   * @param wrappedKey - The encrypted data key in format [IV][Tag][Ciphertext]
   * @param keyId - Identifier for the master key used during wrapping
   * @returns Decrypted data key as Buffer
   * @throws {Error} If keyId not found or decryption fails (invalid auth tag)
   */
  async unwrapDataKey(wrappedKey: Buffer, keyId: string): Promise<Buffer> {
    const masterKey = this.masterKeys.get(keyId);
    if (!masterKey) throw new Error(`Unknown keyId: ${keyId}`);

    // Parse the wrapped key components
    const iv = wrappedKey.subarray(0, 12); // First 12 bytes: IV
    const tag = wrappedKey.subarray(12, 28); // Next 16 bytes: Auth Tag
    const ct = wrappedKey.subarray(28); // Remaining bytes: Ciphertext

    const decipher = createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(tag); // Set authentication tag for integrity verification

    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }

  /**
   * Computes a secure hash of input data using HMAC-SHA256
   *
   * USE CASES:
   * - Duplicate detection for sensitive data without storing plaintext
   * - Creating unique identifiers for encrypted records
   * - Secure comparison of sensitive values
   *
   * SECURITY PROPERTIES:
   * - Deterministic: Same input always produces same output
   * - One-way: Cannot derive original input from hash
   * - Collision-resistant: Different inputs produce different hashes
   *
   * @param input - String data to hash (e.g., account numbers, IFSC codes)
   * @returns Hexadecimal string representation of the HMAC hash
   */
  async computeHash(input: string): Promise<string> {
    return createHmac('sha256', this.hmacKey)
      .update(input, 'utf8')
      .digest('hex');
  }

  /**
   * Returns the identifier of the currently active master key
   *
   * This is used for tracking which key version was used for encryption
   * and enables proper key rotation strategies.
   *
   * @returns Current active key identifier
   */
  async getCurrentKeyId(): Promise<string> {
    return this.activeKeyId;
  }
}
