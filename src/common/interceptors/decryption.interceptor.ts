import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';

/**
 * Applies the `DecryptionInterceptor` to a route handler or controller.
 *
 * Automatically traverses outgoing response payloads and decrypts any compact ciphertext strings
 * (`enc:v1:...`) in parallel batches via `IdentityCryptoService.decryptBatch`.
 */
export const DecryptResponse = () => UseInterceptors(DecryptionInterceptor);

/**
 * Interceptor that recursively inspects outgoing response objects, arrays, or primitives,
 * discovers all encrypted fields (`enc:v1:...`), decrypts them in a single deduplicated batch via
 * `IdentityCryptoService.decryptBatch`, and substitutes the decrypted plaintext values before the
 * response is serialized to the client.
 */
@Injectable()
export class DecryptionInterceptor implements NestInterceptor {
  constructor(private readonly identityCryptoService: IdentityCryptoService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(switchMap((data: unknown) => from(this.decryptPayload(data))));
  }

  /**
   * Recursively discovers all `enc:v1:` ciphertexts in the payload, executes
   * bulk decryption via `decryptBatch`, and replaces them with plaintexts.
   *
   * @param data - Any payload (primitive, array, object, or nested DTO).
   * @returns The payload with all encrypted strings decrypted.
   */
  async decryptPayload<T = unknown>(data: T): Promise<T> {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      if (this.identityCryptoService.isEncryptedText(data)) {
        return (await this.identityCryptoService.decryptText(
          data,
        )) as unknown as T;
      }
      return data;
    }

    if (typeof data !== 'object') {
      return data;
    }

    // Step 1: Collect all encrypted strings
    const encryptedStrings: string[] = [];
    this.collectEncryptedStrings(data, encryptedStrings);

    if (encryptedStrings.length === 0) {
      return data;
    }

    // Step 2: Deduplicate and decrypt in batch
    const uniqueStrings = Array.from(new Set(encryptedStrings));
    const decryptedValues =
      await this.identityCryptoService.decryptBatch(uniqueStrings);

    const lookupMap = new Map<string, string | null>();
    for (let i = 0; i < uniqueStrings.length; i++) {
      lookupMap.set(uniqueStrings[i], decryptedValues[i]);
    }

    // Step 3: Replace encrypted strings recursively
    return this.replaceEncryptedStrings(data, lookupMap) as T;
  }

  private collectEncryptedStrings(data: unknown, collected: string[]): void {
    if (data === null || data === undefined) {
      return;
    }

    if (typeof data === 'string') {
      if (this.identityCryptoService.isEncryptedText(data)) {
        collected.push(data);
      }
      return;
    }

    if (Array.isArray(data)) {
      for (const item of data) {
        this.collectEncryptedStrings(item, collected);
      }
      return;
    }

    if (
      data instanceof Date ||
      data instanceof RegExp ||
      Buffer.isBuffer(data)
    ) {
      return;
    }

    if (typeof data === 'object') {
      for (const key of Object.keys(data)) {
        this.collectEncryptedStrings(
          (data as Record<string, unknown>)[key],
          collected,
        );
      }
    }
  }

  private replaceEncryptedStrings(
    data: unknown,
    lookupMap: Map<string, string | null>,
  ): unknown {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      if (lookupMap.has(data)) {
        return lookupMap.get(data) ?? null;
      }
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.replaceEncryptedStrings(item, lookupMap));
    }

    if (
      data instanceof Date ||
      data instanceof RegExp ||
      Buffer.isBuffer(data)
    ) {
      return data;
    }

    if (typeof data === 'object') {
      // Preserve the original prototype (critical for class-transformer or downstream DTO processing)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result: Record<string, unknown> = Object.create(
        Object.getPrototypeOf(data) as object,
      );

      for (const key of Object.keys(data)) {
        const value = (data as Record<string, unknown>)[key];
        result[key] = this.replaceEncryptedStrings(value, lookupMap);
      }
      return result;
    }

    return data;
  }
}
