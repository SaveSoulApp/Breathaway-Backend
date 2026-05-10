export interface IKeyManager {
  /**
   * Wrap (encrypt) a plaintext data key.
   * Returns wrappedKey (Buffer) and keyId (string) identifying the master key used.
   */
  wrapDataKey(
    plaintextKey: Buffer,
  ): Promise<{ wrappedKey: Buffer; keyId: string }>;

  /**
   * Unwrap (decrypt) wrappedKey and return plaintext data key.
   */
  unwrapDataKey(wrappedKey: Buffer, keyId?: string): Promise<Buffer>;

  /**
   * Deterministic fingerprint used for searching/uniqueness (HMAC-SHA256 hex).
   * Must be deterministic: same string -> same fingerprint.
   */
  computeHash(input: string): Promise<string>;

  /**
   * Current key identifier / short name (useful to store with wrappedKey).
   */
  getCurrentKeyId(): Promise<string>;
}
