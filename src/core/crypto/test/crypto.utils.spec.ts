import { randomBytes } from 'crypto';
import {
  CryptoUtils,
  decryptAesGcm,
  encryptAesGcm,
  generateDataKey,
  hashString,
} from '../crypto.utils';

describe('CryptoUtils', () => {
  // ─── toHex & fromHex ────────────────────────────────────────────────────────

  describe('toHex and fromHex', () => {
    it('should convert Buffer to lowercase hex string', () => {
      const buf = Buffer.from('hello', 'utf8');
      expect(CryptoUtils.toHex(buf)).toBe('68656c6c6f');
    });

    it('should return empty string for null, undefined, or empty buffer', () => {
      expect(CryptoUtils.toHex(null)).toBe('');
      expect(CryptoUtils.toHex(undefined)).toBe('');
      expect(CryptoUtils.toHex(Buffer.alloc(0))).toBe('');
    });

    it('should parse hex string to Buffer correctly', () => {
      const hex = '68656c6c6f';
      const buf = CryptoUtils.fromHex(hex);
      expect(buf.toString('utf8')).toBe('hello');
    });
  });

  // ─── fromHex32 ──────────────────────────────────────────────────────────────

  describe('fromHex32', () => {
    it('should parse valid 64-char hex string to 32-byte Buffer', () => {
      const validHex = 'a'.repeat(64);
      const buf = CryptoUtils.fromHex32(validHex);
      expect(buf).not.toBeNull();
      expect(buf?.length).toBe(32);
    });

    it('should return null for invalid lengths', () => {
      expect(CryptoUtils.fromHex32('abcd')).toBeNull();
      expect(CryptoUtils.fromHex32('a'.repeat(63))).toBeNull();
      expect(CryptoUtils.fromHex32('a'.repeat(65))).toBeNull();
    });

    it('should return null for non-hex characters', () => {
      const invalidHex = 'g'.repeat(64);
      expect(CryptoUtils.fromHex32(invalidHex)).toBeNull();
    });

    it('should return null for null or non-string inputs', () => {
      expect(CryptoUtils.fromHex32(null)).toBeNull();
      expect(CryptoUtils.fromHex32(undefined)).toBeNull();
      expect(CryptoUtils.fromHex32('' as any)).toBeNull();
    });

    it('should trim surrounding whitespace', () => {
      const validHex = `  ${'b'.repeat(64)}  `;
      const buf = CryptoUtils.fromHex32(validHex);
      expect(buf).not.toBeNull();
      expect(buf?.length).toBe(32);
    });
  });

  // ─── toBase64 & fromBase64 ──────────────────────────────────────────────────

  describe('toBase64 and fromBase64', () => {
    it('should convert Buffer to Base64 and back', () => {
      const original = Buffer.from('Test Base64 Data');
      const b64 = CryptoUtils.toBase64(original);
      const restored = CryptoUtils.fromBase64(b64);
      expect(restored.equals(original)).toBe(true);
    });

    it('should return empty string for nullish or empty buffer', () => {
      expect(CryptoUtils.toBase64(null)).toBe('');
      expect(CryptoUtils.toBase64(undefined)).toBe('');
      expect(CryptoUtils.toBase64(Buffer.alloc(0))).toBe('');
    });
  });

  // ─── equals & constantTimeEquals ────────────────────────────────────────────

  describe('equals and constantTimeEquals', () => {
    it('should correctly compare identical and differing buffers', () => {
      const a = Buffer.from('same');
      const b = Buffer.from('same');
      const c = Buffer.from('diff');

      expect(CryptoUtils.equals(a, b)).toBe(true);
      expect(CryptoUtils.equals(a, c)).toBe(false);
      expect(CryptoUtils.equals(null, null)).toBe(true);
      expect(CryptoUtils.equals(a, null)).toBe(false);
      expect(CryptoUtils.equals(null, b)).toBe(false);
    });

    it('should perform constant-time comparison', () => {
      const a = Buffer.from('1234567812345678');
      const b = Buffer.from('1234567812345678');
      const c = Buffer.from('8765432187654321');
      const short = Buffer.from('short');

      expect(CryptoUtils.constantTimeEquals(a, b)).toBe(true);
      expect(CryptoUtils.constantTimeEquals(a, c)).toBe(false);
      expect(CryptoUtils.constantTimeEquals(a, short)).toBe(false);
    });
  });

  // ─── isHex64 ────────────────────────────────────────────────────────────────

  describe('isHex64', () => {
    it('should return true for 64-char hex strings', () => {
      expect(CryptoUtils.isHex64('0'.repeat(64))).toBe(true);
      expect(
        CryptoUtils.isHex64(
          '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        ),
      ).toBe(true);
    });

    it('should return false for invalid strings', () => {
      expect(CryptoUtils.isHex64('short')).toBe(false);
      expect(CryptoUtils.isHex64('z'.repeat(64))).toBe(false);
      expect(CryptoUtils.isHex64(null)).toBe(false);
      expect(CryptoUtils.isHex64(undefined)).toBe(false);
    });
  });

  // ─── hashString ──────────────────────────────────────────────────────────────

  describe('hashString', () => {
    it('should return a 64-character hex string (SHA-256)', () => {
      const result = hashString('hello');
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[a-f0-9]+$/);
    });

    it('should produce a deterministic output for the same input', () => {
      expect(hashString('test-input')).toBe(hashString('test-input'));
    });

    it('should produce different hashes for different inputs', () => {
      expect(hashString('foo')).not.toBe(hashString('bar'));
    });

    it('should match a known SHA-256 digest', () => {
      // echo -n "hello" | sha256sum → 2cf24dba...
      expect(hashString('hello')).toBe(
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      );
    });

    it('should handle empty string input', () => {
      // SHA-256 of "" is well-known
      expect(hashString('')).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
    });

    it('should handle unicode characters', () => {
      const result = hashString('こんにちは');
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[a-f0-9]+$/);
    });
  });

  // ─── generateDataKey ─────────────────────────────────────────────────────────

  describe('generateDataKey', () => {
    it('should return a Buffer of exactly 32 bytes', () => {
      const key = generateDataKey();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.byteLength).toBe(32);
    });

    it('should return a different key on each call (random)', () => {
      const key1 = generateDataKey();
      const key2 = generateDataKey();
      expect(key1.equals(key2)).toBe(false);
    });
  });

  // ─── encryptAesGcm ───────────────────────────────────────────────────────────

  describe('encryptAesGcm', () => {
    let key: Buffer;

    beforeEach(() => {
      key = generateDataKey();
    });

    it('should return ciphertext, iv, and tag as Buffers', () => {
      const { ciphertext, iv, tag } = encryptAesGcm('hello', key);
      expect(Buffer.isBuffer(ciphertext)).toBe(true);
      expect(Buffer.isBuffer(iv)).toBe(true);
      expect(Buffer.isBuffer(tag)).toBe(true);
    });

    it('should produce a 12-byte IV', () => {
      const { iv } = encryptAesGcm('hello', key);
      expect(iv.byteLength).toBe(12);
    });

    it('should produce a 16-byte GCM authentication tag', () => {
      const { tag } = encryptAesGcm('hello', key);
      expect(tag.byteLength).toBe(16);
    });

    it('should not return plaintext as ciphertext', () => {
      const plaintext = 'sensitive-data';
      const { ciphertext } = encryptAesGcm(plaintext, key);
      expect(ciphertext.toString('utf8')).not.toBe(plaintext);
    });

    it('should produce different ciphertext for the same plaintext on each call (random IV)', () => {
      const { ciphertext: c1 } = encryptAesGcm('same-input', key);
      const { ciphertext: c2 } = encryptAesGcm('same-input', key);
      expect(c1.equals(c2)).toBe(false);
    });

    it('should handle empty string', () => {
      const { ciphertext, iv, tag } = encryptAesGcm('', key);
      expect(Buffer.isBuffer(ciphertext)).toBe(true);
      expect(iv.byteLength).toBe(12);
      expect(tag.byteLength).toBe(16);
    });

    it('should handle multi-byte unicode strings', () => {
      const { ciphertext, iv, tag } = encryptAesGcm('こんにちは', key);
      expect(Buffer.isBuffer(ciphertext)).toBe(true);
      expect(iv.byteLength).toBe(12);
      expect(tag.byteLength).toBe(16);
    });
  });

  // ─── decryptAesGcm ───────────────────────────────────────────────────────────

  describe('decryptAesGcm', () => {
    let key: Buffer;

    beforeEach(() => {
      key = generateDataKey();
    });

    it('should decrypt back to the original plaintext', () => {
      const plaintext = 'hello world';
      const { ciphertext, iv, tag } = encryptAesGcm(plaintext, key);
      expect(decryptAesGcm(ciphertext, iv, tag, key)).toBe(plaintext);
    });

    it('should decrypt an empty string correctly', () => {
      const { ciphertext, iv, tag } = encryptAesGcm('', key);
      expect(decryptAesGcm(ciphertext, iv, tag, key)).toBe('');
    });

    it('should decrypt unicode strings correctly', () => {
      const plaintext = 'こんにちは';
      const { ciphertext, iv, tag } = encryptAesGcm(plaintext, key);
      expect(decryptAesGcm(ciphertext, iv, tag, key)).toBe(plaintext);
    });

    it('should decrypt long strings correctly', () => {
      const plaintext = 'a'.repeat(10_000);
      const { ciphertext, iv, tag } = encryptAesGcm(plaintext, key);
      expect(decryptAesGcm(ciphertext, iv, tag, key)).toBe(plaintext);
    });

    it('should throw when decrypting with a wrong key (tag mismatch)', () => {
      const { ciphertext, iv, tag } = encryptAesGcm('secret', key);
      const wrongKey = generateDataKey();
      expect(() => decryptAesGcm(ciphertext, iv, tag, wrongKey)).toThrow();
    });

    it('should throw when the authentication tag is tampered with', () => {
      const { ciphertext, iv, tag } = encryptAesGcm('secret', key);
      const tamperedTag = Buffer.from(tag);
      tamperedTag[0] ^= 0xff; // Flip all bits in the first byte
      expect(() => decryptAesGcm(ciphertext, iv, tamperedTag, key)).toThrow();
    });

    it('should throw when the ciphertext is tampered with', () => {
      const { ciphertext, iv, tag } = encryptAesGcm('secret', key);
      const tamperedCiphertext = Buffer.from(ciphertext);
      tamperedCiphertext[0] ^= 0xff;
      expect(() => decryptAesGcm(tamperedCiphertext, iv, tag, key)).toThrow();
    });

    it('should throw when the IV is tampered with', () => {
      const { ciphertext, tag } = encryptAesGcm('secret', key);
      const tamperedIv = randomBytes(12); // Completely different IV
      expect(() => decryptAesGcm(ciphertext, tamperedIv, tag, key)).toThrow();
    });
  });
});
