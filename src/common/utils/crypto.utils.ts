import { createHash } from 'node:crypto';

/**
 * Creates a SHA-256 hash of a string.
 * @param data The string to hash.
 * @returns The hex-encoded hash.
 */
export const hashString = (data: string): string => {
  return createHash('sha256').update(data).digest('hex');
};
