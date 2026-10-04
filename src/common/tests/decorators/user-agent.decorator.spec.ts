import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

import { UserAgent } from '../../decorators/user-agent.decorator';
import { createMockExecutionContext } from '../mocks/execution-context.mock';

const getParamDecoratorFactory = (
  decorator: (...args: unknown[]) => ParameterDecorator,
) => {
  class TestClass {
    testMethod(@decorator() _param: unknown) {
      return _param;
    }
  }
  const args = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    TestClass,
    'testMethod',
  ) as Record<string, { factory: (...args: unknown[]) => unknown }>;
  return args[Object.keys(args)[0]].factory;
};

describe('@UserAgent Decorator', () => {
  const factory = getParamDecoratorFactory(UserAgent);

  it('should extract x-user-agent header when present', () => {
    const context = createMockExecutionContext({
      headers: {
        'x-user-agent': 'BreathAway/1.0.0 (iOS 17.0; iPhone15)',
        'user-agent': 'Mozilla/5.0 (iPhone)',
      },
    });

    const result = factory(null, context);
    expect(result).toBe('BreathAway/1.0.0 (iOS 17.0; iPhone15)');
  });

  it('should fallback to user-agent header when x-user-agent is absent', () => {
    const context = createMockExecutionContext({
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
    });

    const result = factory(null, context);
    expect(result).toBe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
  });

  it('should handle array x-user-agent header', () => {
    const context = createMockExecutionContext({
      headers: {
        'x-user-agent': ['BreathAway/2.0.0 (Android 14; Pixel8)'],
      },
    });

    const result = factory(null, context);
    expect(result).toBe('BreathAway/2.0.0 (Android 14; Pixel8)');
  });

  it('should return undefined when neither header is present', () => {
    const context = createMockExecutionContext({
      headers: {},
    });

    const result = factory(null, context);
    expect(result).toBeUndefined();
  });
});
