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
});

describe('SerializeExclude Decorator', () => {
  it('should be defined', () => {
    expect(SerializeExclude(TestDto)).toBeDefined();
  });
});
