import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

import { DeviceId } from '../../decorators/device-id.decorator';
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

describe('@DeviceId Decorator', () => {
  const factory = getParamDecoratorFactory(DeviceId);

  it('should extract deviceId from clientIdentity when available', () => {
    const context = createMockExecutionContext({
      headers: { 'x-device-id': 'header-device-id' },
    });
    // Attach clientIdentity to the request object
    context.switchToHttp().getRequest().clientIdentity = {
      deviceId: 'identity-device-id',
    };

    const result = factory(null, context);
    expect(result).toBe('identity-device-id');
  });

  it('should fallback to x-device-id header when clientIdentity is not present', () => {
    const context = createMockExecutionContext({
      headers: {
        'x-device-id': 'device-uuid-1234',
      },
    });

    const result = factory(null, context);
    expect(result).toBe('device-uuid-1234');
  });

  it('should handle array x-device-id header', () => {
    const context = createMockExecutionContext({
      headers: {
        'x-device-id': ['device-array-5678'],
      },
    });

    const result = factory(null, context);
    expect(result).toBe('device-array-5678');
  });

  it('should return undefined when neither clientIdentity nor x-device-id is present', () => {
    const context = createMockExecutionContext({
      headers: {},
    });

    const result = factory(null, context);
    expect(result).toBeUndefined();
  });
});
