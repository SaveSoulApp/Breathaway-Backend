/**
 * @techdebt TS57-PRISMA7-BYTES-AUGMENTATION
 *
 * TECHNICAL DEBT NOTE:
 * Global ambient augmentation of `Uint8Array.slice` return type to `ArrayBufferLike`.
 *
 * ROOT CAUSE:
 * In TypeScript 5.7+, `Uint8Array` was converted into a generic interface:
 *   `interface Uint8Array<TArrayBuffer extends ArrayBufferLike = ArrayBuffer>`
 * Under this definition, `Uint8Array.prototype.slice()` returns `Uint8Array<ArrayBuffer>`.
 * However, Node.js 22 types define `Buffer` as extending `Uint8Array<ArrayBufferLike>`.
 * Prisma Client v7 declares model `Bytes` fields as:
 *   `type Bytes = ReturnType<Uint8Array['slice']>` (i.e. `Uint8Array<ArrayBuffer>`).
 * Consequently, passing standard Node.js `Buffer` instances (or `Buffer.from(...)`) to any
 * Prisma `Bytes` field triggers compilation error TS2322:
 *   "Type 'Buffer<ArrayBufferLike>' is not assignable to type 'Uint8Array<ArrayBuffer>'."
 *
 * CODE SMELL & RISKS:
 * Global ambient declarations modify the `Uint8Array` interface across the entire compilation
 * context, which could potentially mask typing nuances in other libraries.
 *
 * REMOVAL PLAN & EXIT CRITERIA:
 * 1. Monitor Prisma Client releases (v7.9+, v8.0) and TypeScript/Node updates.
 * 2. When Prisma Client broadens `type Bytes` to `Uint8Array<ArrayBufferLike>` or natively accepts `Buffer`,
 *    DELETE this file (`src/types/prisma-bytes.d.ts`).
 * 3. Verify clean compilation via `pnpm exec tsc --noEmit`.
 */
export {};

declare global {
  interface Uint8Array<
    _TArrayBuffer extends ArrayBufferLike = ArrayBufferLike,
  > {
    slice(start?: number, end?: number): Uint8Array<ArrayBufferLike>;
  }
}
