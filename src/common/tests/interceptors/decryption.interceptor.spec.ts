import { lastValueFrom, Observable } from 'rxjs';

import {
  DecryptionInterceptor,
  DecryptResponse,
} from '@common/interceptors/decryption.interceptor';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';

import {
  createMockCallHandler,
  createMockExecutionContext,
} from '../mocks/execution-context.mock';

describe('DecryptionInterceptor', () => {
  let interceptor: DecryptionInterceptor;
  let identityCryptoServiceMock: jest.Mocked<IdentityCryptoService>;

  beforeEach(() => {
    identityCryptoServiceMock = {
      isEncryptedText: jest
        .fn()
        .mockImplementation(
          (val?: string | null) =>
            typeof val === 'string' && val.startsWith('enc:v1:'),
        ),
      decryptText: jest.fn().mockImplementation((val?: string | null) => {
        if (!val || !val.startsWith('enc:v1:')) return Promise.resolve(null);
        return Promise.resolve(val.replace('enc:v1:', 'decrypted:'));
      }),
      decryptBatch: jest
        .fn()
        .mockImplementation((values: (string | null | undefined)[]) => {
          return Promise.resolve(
            values.map((v) =>
              v && v.startsWith('enc:v1:')
                ? v.replace('enc:v1:', 'decrypted:')
                : null,
            ),
          );
        }),
    } as unknown as jest.Mocked<IdentityCryptoService>;

    interceptor = new DecryptionInterceptor(identityCryptoServiceMock);
  });

  it('should return untouched response when payload is null, undefined, or primitive non-encrypted', async () => {
    const context = createMockExecutionContext();
    const callHandler = createMockCallHandler({ count: 42, active: true });

    const resultObservable = interceptor.intercept(context, callHandler);
    const result = await lastValueFrom(resultObservable);

    expect(result).toEqual({ count: 42, active: true });
    expect(identityCryptoServiceMock.decryptBatch).not.toHaveBeenCalled();
  });

  it('should decrypt a single string payload when it is encrypted', async () => {
    const context = createMockExecutionContext();
    const callHandler = createMockCallHandler('enc:v1:single-secret');

    const resultObservable = interceptor.intercept(context, callHandler);
    const result = await lastValueFrom(resultObservable);

    expect(result).toBe('decrypted:single-secret');
    expect(identityCryptoServiceMock.decryptText).toHaveBeenCalledWith(
      'enc:v1:single-secret',
    );
  });

  it('should return untouched payload if no encrypted strings are found', async () => {
    const context = createMockExecutionContext();
    const payload = {
      id: '123',
      name: 'Plaintext Name',
      date: new Date('2026-01-01'),
    };
    const callHandler = createMockCallHandler(payload);

    const resultObservable = interceptor.intercept(context, callHandler);
    const result = await lastValueFrom(resultObservable);

    expect(result).toEqual(payload);
    expect(identityCryptoServiceMock.decryptBatch).not.toHaveBeenCalled();
  });

  it('should discover encrypted strings in a flat object and replace them using decryptBatch', async () => {
    const context = createMockExecutionContext();
    const payload = {
      id: 'profile-1',
      firstName: 'enc:v1:encrypted-first',
      lastName: 'enc:v1:encrypted-last',
      bio: 'Public bio',
    };
    const callHandler = createMockCallHandler(payload);

    const resultObservable = interceptor.intercept(context, callHandler);
    const result = (await lastValueFrom(resultObservable)) as typeof payload;

    expect(result).toEqual({
      id: 'profile-1',
      firstName: 'decrypted:encrypted-first',
      lastName: 'decrypted:encrypted-last',
      bio: 'Public bio',
    });
    expect(identityCryptoServiceMock.decryptBatch).toHaveBeenCalledWith([
      'enc:v1:encrypted-first',
      'enc:v1:encrypted-last',
    ]);
  });

  it('should handle nested structures, arrays, and deduplicate identical encrypted strings', async () => {
    const context = createMockExecutionContext();
    const sharedEncrypted = 'enc:v1:shared-name';
    const payload = {
      data: [
        {
          id: 'user-1',
          name: sharedEncrypted,
          secret: 'enc:v1:unique-secret-1',
        },
        {
          id: 'user-2',
          name: sharedEncrypted,
          secret: 'enc:v1:unique-secret-2',
        },
      ],
      meta: { total: 2 },
    };
    const callHandler = createMockCallHandler(payload);

    const resultObservable = interceptor.intercept(context, callHandler);
    const result = (await lastValueFrom(resultObservable)) as typeof payload;

    expect(result.data[0].name).toBe('decrypted:shared-name');
    expect(result.data[1].name).toBe('decrypted:shared-name');
    expect(result.data[0].secret).toBe('decrypted:unique-secret-1');
    expect(result.data[1].secret).toBe('decrypted:unique-secret-2');

    // Verify deduplication in decryptBatch call
    expect(identityCryptoServiceMock.decryptBatch).toHaveBeenCalledWith([
      sharedEncrypted,
      'enc:v1:unique-secret-1',
      'enc:v1:unique-secret-2',
    ]);
  });

  it('should preserve Date, RegExp, and Buffer instances without attempting to inspect them', async () => {
    const context = createMockExecutionContext();
    const now = new Date();
    const buffer = Buffer.from('test-buffer');
    const regex = /^test$/;

    const payload = {
      createdAt: now,
      raw: buffer,
      pattern: regex,
      secret: 'enc:v1:secret',
    };
    const callHandler = createMockCallHandler(payload);

    const resultObservable = interceptor.intercept(context, callHandler);
    const result = (await lastValueFrom(resultObservable)) as typeof payload;

    expect(result.createdAt).toBe(now);
    expect(result.raw).toBe(buffer);
    expect(result.pattern).toBe(regex);
    expect(result.secret).toBe('decrypted:secret');
  });

  it('should expose the DecryptResponse decorator helper', () => {
    const decorator = DecryptResponse();
    expect(decorator).toBeDefined();
    expect(typeof decorator).toBe('function');
  });
});
