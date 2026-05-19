import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

import { ClientIdentity } from '../../decorators/client-identity.decorator';
import { ClientIdentityKey } from '../../enums/client-identity-key.enum';
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

describe('@ClientIdentity Decorator', () => {
  const factory = getParamDecoratorFactory(ClientIdentity);

  it('should extract full client identity from request', () => {
    const mockIdentity = {
      apiKey: 'key',
      clientId: 'client',
      deviceId: 'device',
      userAgent: {},
    };
    const context = createMockExecutionContext({
      clientIdentity: mockIdentity,
    });

    const result = factory(undefined, context);
    expect(result).toEqual(mockIdentity);
  });

  it('should extract specific property from client identity if data is provided', () => {
    const mockIdentity = {
      apiKey: 'key',
      clientId: 'client',
      deviceId: 'device',
      userAgent: {},
    };
    const context = createMockExecutionContext({
      clientIdentity: mockIdentity,
    });

    const result = factory(ClientIdentityKey.CLIENT_ID, context);
    expect(result).toEqual('client');
  });

  it('should return undefined if client identity does not exist on request', () => {
    const context = createMockExecutionContext({});

    const result = factory(undefined, context);
    expect(result).toBeUndefined();
  });
});
