import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

import { RequestId } from '../../decorators/request-id.decorator';
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

describe('@RequestId Decorator', () => {
  const factory = getParamDecoratorFactory(RequestId);

  it('should extract requestId from request', () => {
    const context = createMockExecutionContext({ requestId: 'req-123' });

    const result = factory(null, context);
    expect(result).toEqual('req-123');
  });

  it('should throw InternalServerErrorException if requestId is not present', () => {
    const context = createMockExecutionContext({});

    expect(() => {
      factory(null, context);
    }).toThrow(
      'Request ID is missing. Ensure the CorrelationIdMiddleware is registered.',
    );
  });
});
