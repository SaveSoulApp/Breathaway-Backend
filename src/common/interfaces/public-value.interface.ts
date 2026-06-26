/**
 * Structure representing an encrypted and securely stored public value (e.g., social security, tax id).
 *
 * Maintains the ciphertext alongside cryptographic metadata needed for decryption,
 * as well as a masked representation for safe display.
 */
export interface PublicValue {
  publicValueHash: string;
  publicValueCiphertext: string;
  publicValueIv: string;
  publicValueTag: string;
  publicValueWrappedKey: string;
  publicValueKeyId: string;
  publicValueMasked: string;
}
