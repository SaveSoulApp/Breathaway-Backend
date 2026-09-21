import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

import { ClientIp } from '../../decorators/client-ip.decorator';
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

describe('@ClientIp Decorator', () => {
  const factory = getParamDecoratorFactory(ClientIp);

  it('should extract first IP from comma-separated X-Forwarded-For header', () => {
    const context = createMockExecutionContext({
      headers: {
        'x-forwarded-for': '103.21.244.2, 34.117.59.81, 169.254.1.1',
      },
    });

    const result = factory(null, context);
    expect(result).toBe('103.21.244.2');
  });

  it('should extract first IP from X-Forwarded-For when supplied as an array', () => {
    const context = createMockExecutionContext({
      headers: {
        'x-forwarded-for': ['203.0.113.195', '198.51.100.1'],
      },
    });

    const result = factory(null, context);
    expect(result).toBe('203.0.113.195');
  });

  it('should fallback to request.ip when X-Forwarded-For header is missing', () => {
    const context = createMockExecutionContext({
      headers: {},
      ip: '198.51.100.24',
    });

    const result = factory(null, context);
    expect(result).toBe('198.51.100.24');
  });

  it('should fallback to request.socket.remoteAddress when X-Forwarded-For and request.ip are absent', () => {
    const context = createMockExecutionContext({
      headers: {},
      socket: { remoteAddress: '203.0.113.50' },
    });

    const result = factory(null, context);
    expect(result).toBe('203.0.113.50');
  });

  it('should return undefined when no IP sources are available', () => {
    const context = createMockExecutionContext({
      headers: {},
    });

    const result = factory(null, context);
    expect(result).toBeUndefined();
  });
});
