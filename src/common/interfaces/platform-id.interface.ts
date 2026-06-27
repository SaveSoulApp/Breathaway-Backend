/**
 * Structure representing an encrypted and securely stored platform identifier.
 *
 * Used to securely manage external integrations without exposing raw identifiers
 * in plaintext in the database.
 */
export interface PlatformId {
  platformIdHash: string;
  platformIdCiphertext: string;
  platformIdIv: string;
  platformIdTag: string;
  platformIdWrappedKey: string;
  platformIdKeyId: string;
}
