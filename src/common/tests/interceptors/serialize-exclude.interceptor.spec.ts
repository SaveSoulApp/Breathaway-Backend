import {
  SerializeExcluderInterceptor,
  SerializeExclude,
} from '../../interceptors/serialize-exclude.interceptor';
import {
  createMockExecutionContext,
  createMockCallHandler,
} from '../mocks/execution-context.mock';
import { lastValueFrom } from 'rxjs';
import { Exclude, Expose } from 'class-transformer';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

class TestDto {
  @Expose()
  publicProp: string;

  @Exclude()
  hiddenProp: string;

  unmarkedProp: string;
}

describe('SerializeExcluderInterceptor', () => {
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

    const resultObservable = interceptor.intercept(context, callHandler) as any;
    const result = await lastValueFrom(resultObservable);

    expect(result).toBeInstanceOf(TestDto);
    expect(result.publicProp).toBe('public');
    expect(result.unmarkedProp).toBe('unmarked');
    expect(result.hiddenProp).toBeUndefined();
  });
});

describe('SerializeExclude Decorator', () => {
  it('should be defined', () => {
    expect(SerializeExclude(TestDto)).toBeDefined();
  });
});
