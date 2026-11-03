import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

/**
 * Utility class encapsulating conversions, formatting, and comparisons between
 * binary ByteA fields (Buffer / Uint8Array) and string representations (hex, base64).
 */
export class CryptoUtils {
  private static readonly HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;

  /**
   * Converts a Uint8Array or Buffer to a lowercase hexadecimal string.
   * Returns empty string if the input is null, undefined, or empty.
   */
  static toHex(buf: Uint8Array | null | undefined): string {
    if (!buf || buf.length === 0) return '';
    return Buffer.from(buf).toString('hex');
  }

  /**
   * Converts a hexadecimal string into a Buffer.
   */
  static fromHex(hex: string): Buffer {
    return Buffer.from(hex, 'hex');
  }

  /**
   * Validates and parses a 64-character hexadecimal SHA-256 / HMAC-SHA-256 string
   * into a 32-byte raw binary Buffer.
   *
   * Returns `null` if the input is nullish, not 64 characters, contains non-hex characters,
   * or parses to a buffer of length other than 32 bytes.
   */
  static fromHex32(hex: string | null | undefined): Buffer | null {
    if (!hex || typeof hex !== 'string') return null;
    const trimmed = hex.trim();
    if (!CryptoUtils.HEX_64_REGEX.test(trimmed)) {
      return null;
    }
    const buf = Buffer.from(trimmed, 'hex');
    return buf.length === 32 ? buf : null;
  }

  /**
   * Converts a Uint8Array or Buffer to a Base64 string.
   * Returns empty string if the input is null, undefined, or empty.
   */
  static toBase64(buf: Uint8Array | null | undefined): string {
    if (!buf || buf.length === 0) return '';
    return Buffer.from(buf).toString('base64');
  }

  /**
   * Converts a Base64 string to a Buffer.
   */
  static fromBase64(b64: string): Buffer {
    return Buffer.from(b64, 'base64');
  }

  /**
   * Checks whether two binary buffers are equal by byte content.
   */
  static equals(
    a: Uint8Array | null | undefined,
    b: Uint8Array | null | undefined,
  ): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return Buffer.from(a).equals(Buffer.from(b));
  }

  /**
   * Constant-time equality comparison to protect against timing attacks on secret digests.
   */
  static constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  /**
   * Validates whether a string is a 64-character hexadecimal representation.
   */
  static isHex64(str: string | null | undefined): boolean {
    if (!str || typeof str !== 'string') return false;
    return CryptoUtils.HEX_64_REGEX.test(str.trim());
  }
}

/**
 * Creates a SHA-256 hash of a string.
 * @param data The string to hash.
 * @returns The hex-encoded hash.
 */
export const hashString = (data: string): string => {
  return createHash('sha256').update(data).digest('hex');
};

/**
 * Generates a 32-byte (256-bit) random data key for AES-256 encryption.
 * @returns A Buffer containing the random data key.
 */
export function generateDataKey(): Buffer {
  return randomBytes(32);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param plaintext - The text to encrypt.
 * @param key - The 256-bit encryption key.
 * @returns An object containing the ciphertext, IV, and GCM authentication tag.
 */
export function encryptAesGcm(
  plaintext: string,
  key: Buffer,
): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

/**
 * Decrypts a ciphertext buffer using AES-256-GCM.
 * @param ciphertext - The encrypted data.
 * @param iv - The Initialization Vector used during encryption.
 * @param tag - The GCM authentication tag.
 * @param key - The 256-bit decryption key.
 * @returns The decrypted plaintext string.
 */
export function decryptAesGcm(
  ciphertext: Buffer,
  iv: Buffer,
  tag: Buffer,
  key: Buffer,
): string {
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
