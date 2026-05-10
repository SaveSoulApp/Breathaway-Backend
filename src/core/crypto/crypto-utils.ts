import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export function generateDataKey(): Buffer {
  return randomBytes(32); // 256-bit key for AES-256
}

export function encryptAesGcm(plaintext: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

export function decryptAesGcm(
  ciphertext: Buffer,
  iv: Buffer,
  tag: Buffer,
  key: Buffer,
) {
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
