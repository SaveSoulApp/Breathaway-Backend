import { SerializeExposerInterceptor, SerializeExpose } from '../../interceptors/serialize-expose.interceptor';
import { createMockExecutionContext, createMockCallHandler } from '../mocks/execution-context.mock';
import { lastValueFrom } from 'rxjs';
import { Exclude, Expose } from 'class-transformer';

class TestDto {
  @Expose()
  publicProp: string;

  hiddenProp: string;
}

describe('SerializeExposerInterceptor', () => {
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

    const resultObservable = interceptor.intercept(context, callHandler) as any;
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
