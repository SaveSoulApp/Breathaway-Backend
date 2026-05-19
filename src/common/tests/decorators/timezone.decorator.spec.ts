import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

import { Timezone } from '../../decorators/timezone.decorator';
import { createMockExecutionContext } from '../mocks/execution-context.mock';

// Extract the factory function from the decorator
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

describe('@Timezone Decorator', () => {
  const factory = getParamDecoratorFactory(Timezone);

  it('should extract timezone from request', () => {
    const context = createMockExecutionContext({
      timezone: 'America/New_York',
    });

    const result = factory(null, context);
    expect(result).toEqual('America/New_York');
  });

  it('should default to UTC if timezone is not set in request', () => {
    const context = createMockExecutionContext({});

    const result = factory(null, context);
    expect(result).toEqual('UTC');
  });
});
