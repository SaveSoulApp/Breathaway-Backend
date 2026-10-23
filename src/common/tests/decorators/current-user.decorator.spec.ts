import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

import {
  CurrentFamilyId,
  CurrentJti,
  CurrentUserId,
} from '../../decorators/current-user.decorator';
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

describe('Current User Decorators', () => {
  describe('@CurrentUserId', () => {
    const factory = getParamDecoratorFactory(CurrentUserId);

    it('should extract userId from request.user', () => {
      const mockUser = {
        userId: '12345',
        email: 'test@example.com',
      };
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

    it('should throw an Error if request.user.userId is missing', () => {
      const context = createMockExecutionContext({ user: {} });

      expect(() => {
        factory(null, context);
      }).toThrow(
        'User payload missing from request context. Ensure AuthGuard is applied.',
      );
    });
  });

  describe('@CurrentJti', () => {
    const factory = getParamDecoratorFactory(CurrentJti);

    it('should extract jti from request.user when present', () => {
      const mockUser = {
        userId: '12345',
        email: 'test@example.com',
        jti: 'jti-token-xyz',
      };
      const context = createMockExecutionContext({ user: mockUser });

      const result = factory(null, context);
      expect(result).toEqual('jti-token-xyz');
    });

    it('should return undefined when jti is missing from request.user', () => {
      const mockUser = {
        userId: '12345',
        email: 'test@example.com',
      };
      const context = createMockExecutionContext({ user: mockUser });

      const result = factory(null, context);
      expect(result).toBeUndefined();
    });

    it('should return undefined when request.user is not present', () => {
      const context = createMockExecutionContext({});

      const result = factory(null, context);
      expect(result).toBeUndefined();
    });
  });

  describe('@CurrentFamilyId', () => {
    const factory = getParamDecoratorFactory(CurrentFamilyId);

    it('should extract familyId from request.user when present', () => {
      const mockUser = {
        userId: '12345',
        email: 'test@example.com',
        familyId: 'family-abc-123',
      };
      const context = createMockExecutionContext({ user: mockUser });

      const result = factory(null, context);
      expect(result).toEqual('family-abc-123');
    });

    it('should return undefined when familyId is missing from request.user', () => {
      const mockUser = {
        userId: '12345',
        email: 'test@example.com',
      };
      const context = createMockExecutionContext({ user: mockUser });

      const result = factory(null, context);
      expect(result).toBeUndefined();
    });

    it('should return undefined when request.user is not present', () => {
      const context = createMockExecutionContext({});

      const result = factory(null, context);
      expect(result).toBeUndefined();
    });
  });
});
