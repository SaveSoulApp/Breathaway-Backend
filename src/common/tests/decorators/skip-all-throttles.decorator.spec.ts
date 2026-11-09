import { Reflector } from '@nestjs/core';
import { THROTTLER_SKIP } from '@nestjs/throttler/dist/throttler.constants';

import { SkipAllThrottles } from '@common/decorators';

describe('SkipAllThrottles Decorator', () => {
  const reflector = new Reflector();

  it('should set skip metadata for all named throttlers on a controller class', () => {
    @SkipAllThrottles()
    class TestController {}

    expect(reflector.get(THROTTLER_SKIP + 'default', TestController)).toBe(
      true,
    );
    expect(reflector.get(THROTTLER_SKIP + 'short', TestController)).toBe(true);
    expect(reflector.get(THROTTLER_SKIP + 'medium', TestController)).toBe(true);
    expect(reflector.get(THROTTLER_SKIP + 'long', TestController)).toBe(true);
  });

  it('should set skip metadata for all named throttlers on a controller method', () => {
    class TestController {
      @SkipAllThrottles()
      testMethod(): void {}
    }

    const instance = new TestController();
    expect(reflector.get(THROTTLER_SKIP + 'default', instance.testMethod)).toBe(
      true,
    );
    expect(reflector.get(THROTTLER_SKIP + 'short', instance.testMethod)).toBe(
      true,
    );
    expect(reflector.get(THROTTLER_SKIP + 'medium', instance.testMethod)).toBe(
      true,
    );
    expect(reflector.get(THROTTLER_SKIP + 'long', instance.testMethod)).toBe(
      true,
    );
  });
});
