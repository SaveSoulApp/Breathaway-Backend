import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RequiredStringQuery } from '../../decorators/required-string.decorator';
import { createMockExecutionContext } from '../mocks/execution-context.mock';
import { BadRequestException } from '@nestjs/common';

// Extract the factory function from the decorator
const getParamDecoratorFactory = (decorator: (...args: unknown[]) => any) => {
  class TestClass {
    testMethod(@decorator('testParam') _param: unknown) {
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

describe('@RequiredStringQuery Decorator', () => {
  const factory = getParamDecoratorFactory(RequiredStringQuery);

  it('should extract and trim the parameter value from query string', () => {
    const context = createMockExecutionContext({
      query: { testParam: '  value  ' },
    });

    const result = factory('testParam', context);
    expect(result).toEqual('value');
  });

  it('should throw BadRequestException if value is undefined', () => {
    const context = createMockExecutionContext({ query: {} });

    expect(() => {
      factory('testParam', context);
    }).toThrow(new BadRequestException('testParam is required'));
  });

  it('should throw BadRequestException if value is null', () => {
    const context = createMockExecutionContext({ query: { testParam: null } });

    expect(() => {
      factory('testParam', context);
    }).toThrow(new BadRequestException('testParam is required'));
  });

  it('should throw BadRequestException if value is not a string', () => {
    const context = createMockExecutionContext({ query: { testParam: 123 } });

    expect(() => {
      factory('testParam', context);
    }).toThrow(new BadRequestException('testParam must be a string'));
  });

  it('should throw BadRequestException if value is an empty string after trimming', () => {
    const context = createMockExecutionContext({ query: { testParam: '   ' } });

    expect(() => {
      factory('testParam', context);
    }).toThrow(new BadRequestException('testParam cannot be empty'));
  });
});
