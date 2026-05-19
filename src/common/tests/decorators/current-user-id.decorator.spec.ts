import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

import { CurrentUserId } from '../../decorators/current-user-id.decorator';
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

describe('@CurrentUserId Decorator', () => {
  const factory = getParamDecoratorFactory(CurrentUserId);

  it('should extract userId from request.user', () => {
    const mockUser = { userId: '12345' };
    const context = createMockExecutionContext({ user: mockUser });

    const result = factory(null, context);
    expect(result).toEqual('12345');
  });

  it('should throw an Error if request.user is not found', () => {
    const context = createMockExecutionContext({});

    expect(() => {
      factory(null, context);
    }).toThrow(
      'User payload missing from request context. Ensure AuthGuard is applied.',
    );
  });
});
