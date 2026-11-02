/**
 * Structure representing an encrypted and securely stored platform identifier.
 *
 * Used to securely manage external integrations without exposing raw identifiers
 * in plaintext in the database.
 */
export interface PlatformId {
  platformIdHash: Uint8Array;
  platformIdCiphertext: Uint8Array;
  platformIdIv: Uint8Array;
  platformIdTag: Uint8Array;
  platformIdWrappedKey: Uint8Array;
  platformIdKeyId: string;
}
