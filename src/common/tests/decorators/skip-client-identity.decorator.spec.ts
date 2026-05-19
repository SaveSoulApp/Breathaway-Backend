import { SkipClientIdentity } from '../../decorators/skip-client-identity.decorator';
import { SKIP_CLIENT_IDENTITY_META } from '../../guards/client-identity.guard';

describe('@SkipClientIdentity Decorator', () => {
  it('should attach SKIP_CLIENT_IDENTITY_META metadata to the target', () => {
    class TestClass {
      @SkipClientIdentity()
      testMethod() {}
    }

    const metadata = Reflect.getMetadata(
      SKIP_CLIENT_IDENTITY_META,
      TestClass.prototype.testMethod,
    );
    expect(metadata).toBe(true);
  });
});
