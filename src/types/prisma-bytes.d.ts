/**
 * Augments Uint8Array.slice return type to ArrayBufferLike.
 *
 * This resolves a TypeScript 5.7+ / Node 22+ type mismatch with Prisma 7, where
 * Prisma declares `type Bytes = ReturnType<Uint8Array['slice']>`. In TS 5.7, Uint8Array.slice
 * defaults strictly to ArrayBuffer, which rejects Node.js Buffer (which extends Uint8Array<ArrayBufferLike>).
 */
export {};

declare global {
  interface Uint8Array<
    _TArrayBuffer extends ArrayBufferLike = ArrayBufferLike,
  > {
    slice(start?: number, end?: number): Uint8Array<ArrayBufferLike>;
  }
}
