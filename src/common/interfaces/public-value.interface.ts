/**
 * Structure representing an encrypted and securely stored public value (e.g., social security, tax id).
 *
 * Maintains the ciphertext alongside cryptographic metadata needed for decryption,
 * as well as a masked representation for safe display.
 */
export interface PublicValue {
  publicValueHash: Uint8Array;
  publicValueCiphertext: Uint8Array;
  publicValueIv: Uint8Array;
  publicValueTag: Uint8Array;
  publicValueWrappedKey: Uint8Array;
  publicValueKeyId: string;
  publicValueMasked: string;
}
