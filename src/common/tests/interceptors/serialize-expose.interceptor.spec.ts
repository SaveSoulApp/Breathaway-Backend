import { Expose } from 'class-transformer';
import { lastValueFrom, Observable } from 'rxjs';
import {
  SerializeExpose,
  SerializeExposerInterceptor,
} from '../../interceptors/serialize-expose.interceptor';
import {
  createMockCallHandler,
  createMockExecutionContext,
} from '../mocks/execution-context.mock';

class TestDto {
  @Expose()
  publicProp: string;

  hiddenProp: string;
}

describe(SerializeExposerInterceptor.name, () => {
  let interceptor: SerializeExposerInterceptor;

  beforeEach(() => {
    interceptor = new SerializeExposerInterceptor(TestDto);
  });

  it('should transform data and expose ONLY marked properties', async () => {
    const context = createMockExecutionContext();
    const callHandler = createMockCallHandler({
      publicProp: 'public',
      hiddenProp: 'hidden',
    });

    const resultObservable = interceptor.intercept(
      context,
      callHandler,
    ) as Observable<TestDto>;
    const result = await lastValueFrom(resultObservable);

    expect(result).toBeInstanceOf(TestDto);
    expect(result.publicProp).toBe('public');
    expect(result.hiddenProp).toBeUndefined(); // Extraneous values excluded
  });
});

describe('SerializeExpose Decorator', () => {
  it('should be defined', () => {
    expect(SerializeExpose(TestDto)).toBeDefined();
  });
});
