import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

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
