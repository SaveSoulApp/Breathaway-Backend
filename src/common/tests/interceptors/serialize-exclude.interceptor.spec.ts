import { Prisma } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';
import { lastValueFrom, Observable } from 'rxjs';

import {
  SerializeExclude,
  SerializeExcluderInterceptor,
} from '../../interceptors/serialize-exclude.interceptor';
import {
  createMockCallHandler,
  createMockExecutionContext,
} from '../mocks/execution-context.mock';

class TestDto {
  @Expose()
  publicProp: string;

  @Exclude()
  hiddenProp: string;

  unmarkedProp: string;
}

class DecimalExcludeDto {
  id: string;
  amount: number;
}

describe(SerializeExcluderInterceptor.name, () => {
  let interceptor: SerializeExcluderInterceptor;

  beforeEach(() => {
    interceptor = new SerializeExcluderInterceptor(TestDto);
  });

  it('should transform data and exclude marked properties while keeping unmarked properties', async () => {
    const context = createMockExecutionContext();
    const callHandler = createMockCallHandler({
      publicProp: 'public',
      hiddenProp: 'hidden',
      unmarkedProp: 'unmarked',
    });

    const resultObservable = interceptor.intercept(
      context,
      callHandler,
    ) as Observable<TestDto>;
    const result = await lastValueFrom(resultObservable);

    expect(result).toBeInstanceOf(TestDto);
    expect(result.publicProp).toBe('public');
    expect(result.unmarkedProp).toBe('unmarked');
    expect(result.hiddenProp).toBeUndefined();
  });

  it('should convert Prisma.Decimal values into numbers without throwing DecimalError', async () => {
    const decimalInterceptor = new SerializeExcluderInterceptor(
      DecimalExcludeDto,
    );
    const context = createMockExecutionContext();
    const callHandler = createMockCallHandler({
      id: 'item_1',
      amount: new Prisma.Decimal('99.95'),
    });

    const resultObservable = decimalInterceptor.intercept(
      context,
      callHandler,
    ) as Observable<DecimalExcludeDto>;
    const result = await lastValueFrom(resultObservable);

    expect(result).toBeInstanceOf(DecimalExcludeDto);
    expect(result.id).toBe('item_1');
    expect(result.amount).toBe(99.95);
    expect(typeof result.amount).toBe('number');
  });
});

describe('SerializeExclude Decorator', () => {
  it('should be defined', () => {
    expect(SerializeExclude(TestDto)).toBeDefined();
  });
});
