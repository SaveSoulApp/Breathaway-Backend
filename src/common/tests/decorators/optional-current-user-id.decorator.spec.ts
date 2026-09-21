import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

import { OptionalCurrentUserId } from '../../decorators/optional-current-user-id.decorator';
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

describe('@OptionalCurrentUserId Decorator', () => {
  const factory = getParamDecoratorFactory(OptionalCurrentUserId);

  it('should extract userId from request.user when authenticated', () => {
    const mockUser = { userId: '12345', email: 'test@example.com' };
    const context = createMockExecutionContext({ user: mockUser });

    const result = factory(null, context);
    expect(result).toEqual('12345');
  });

  it('should return null when request.user is null', () => {
    const context = createMockExecutionContext({ user: null });

    const result = factory(null, context);
    expect(result).toBeNull();
  });

  it('should return null when request.user is undefined', () => {
    const context = createMockExecutionContext({});

    const result = factory(null, context);
    expect(result).toBeNull();
  });
});
