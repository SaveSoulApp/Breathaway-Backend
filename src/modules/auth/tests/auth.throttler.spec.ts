jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-id',
}));

import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import {
  seconds,
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';
import {
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';

import { BasicAuthGuard, JwtAuthGuard } from '@common/guards';
import { extractClientIp } from '@common/utils/request.utils';
import { LoggerService } from '@core/logger';

import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import {
  AUTH_DEV_LOGIN_THROTTLE,
  AUTH_REFRESH_THROTTLE,
  AUTH_STRICT_THROTTLE,
} from '../constants';

describe('Auth Throttling', () => {
  let moduleRef: TestingModule;
  let controller: AuthController;
  let reflector: Reflector;
  let guard: ThrottlerGuard;

  const mockAuthService = {
    signup: jest.fn().mockResolvedValue({ userId: 'u1' }),
    signin: jest.fn().mockResolvedValue({ userId: 'u1' }),
    signInOrSignUp: jest.fn().mockResolvedValue({ userId: 'u1' }),
    refresh: jest
      .fn()
      .mockResolvedValue({ accessToken: 'a1', refreshToken: 'r1' }),
    devLogin: jest.fn().mockResolvedValue({ userId: 'dev-1' }),
  };

  const loggerServiceMock = {
    forContext: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
    }),
  };

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRootAsync({
          useFactory: () => ({
            getTracker: (req: Record<string, any>) =>
              extractClientIp(req) || '127.0.0.1',
            throttlers: [
              { name: 'short', ttl: seconds(1), limit: 5 },
              { name: 'medium', ttl: seconds(10), limit: 20 },
              { name: 'long', ttl: seconds(60), limit: 50 },
            ],
          }),
        }),
      ],
      controllers: [AuthController],
      providers: [
        ThrottlerGuard,
        { provide: AuthService, useValue: mockAuthService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    })
      .overrideGuard(BasicAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get<AuthController>(AuthController);
    reflector = moduleRef.get<Reflector>(Reflector);
    guard = moduleRef.get<ThrottlerGuard>(ThrottlerGuard);
    await guard.onModuleInit();
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  describe('Throttle Metadata Verification', () => {
    it('should attach strict throttling metadata to /refresh', () => {
      const shortLimit = reflector.get(
        THROTTLER_LIMIT + 'short',
        controller.refresh,
      );
      const mediumLimit = reflector.get(
        THROTTLER_LIMIT + 'medium',
        controller.refresh,
      );
      const longLimit = reflector.get(
        THROTTLER_LIMIT + 'long',
        controller.refresh,
      );

      expect(shortLimit).toBe(AUTH_REFRESH_THROTTLE.short.limit);
      expect(mediumLimit).toBe(AUTH_REFRESH_THROTTLE.medium.limit);
      expect(longLimit).toBe(AUTH_REFRESH_THROTTLE.long.limit);
    });

    it('should attach strict throttling metadata to /signin', () => {
      const shortLimit = reflector.get(
        THROTTLER_LIMIT + 'short',
        controller.signin,
      );
      const longLimit = reflector.get(
        THROTTLER_LIMIT + 'long',
        controller.signin,
      );

      expect(shortLimit).toBe(AUTH_STRICT_THROTTLE.short.limit);
      expect(longLimit).toBe(AUTH_STRICT_THROTTLE.long.limit);
    });

    it('should attach strict throttling metadata to /signup', () => {
      const shortLimit = reflector.get(
        THROTTLER_LIMIT + 'short',
        controller.signup,
      );
      const longLimit = reflector.get(
        THROTTLER_LIMIT + 'long',
        controller.signup,
      );

      expect(shortLimit).toBe(AUTH_STRICT_THROTTLE.short.limit);
      expect(longLimit).toBe(AUTH_STRICT_THROTTLE.long.limit);
    });

    it('should attach strict throttling metadata to /signin-or-signup', () => {
      const shortLimit = reflector.get(
        THROTTLER_LIMIT + 'short',
        controller.signinOrSignup,
      );
      const longLimit = reflector.get(
        THROTTLER_LIMIT + 'long',
        controller.signinOrSignup,
      );

      expect(shortLimit).toBe(AUTH_STRICT_THROTTLE.short.limit);
      expect(longLimit).toBe(AUTH_STRICT_THROTTLE.long.limit);
    });

    it('should attach dev-login throttling metadata to /dev-login', () => {
      const shortLimit = reflector.get(
        THROTTLER_LIMIT + 'short',
        controller.devLogin,
      );
      const longLimit = reflector.get(
        THROTTLER_LIMIT + 'long',
        controller.devLogin,
      );

      expect(shortLimit).toBe(AUTH_DEV_LOGIN_THROTTLE.short.limit);
      expect(longLimit).toBe(AUTH_DEV_LOGIN_THROTTLE.long.limit);
    });
  });

  describe('ThrottlerGuard Enforcement on /refresh', () => {
    function createMockContext(
      handler: (...args: unknown[]) => unknown,
      ip: string,
    ): ExecutionContext {
      const mockReq: Record<string, unknown> = {
        headers: { 'x-forwarded-for': ip },
        ip,
      };
      const mockRes: Record<string, any> = {
        header: jest.fn(),
      };

      return {
        getHandler: () => handler,
        getClass: () => AuthController,
        switchToHttp: () => ({
          getRequest: () => mockReq,
          getResponse: () => mockRes,
        }),
      } as unknown as ExecutionContext;
    }

    it('should allow up to 2 calls in short window and block on 3rd rapid call for /refresh', async () => {
      const ctx = createMockContext(controller.refresh, '198.51.100.10');

      // 1st request -> allowed
      await expect(guard.canActivate(ctx)).resolves.toBe(true);

      // 2nd request -> allowed
      await expect(guard.canActivate(ctx)).resolves.toBe(true);

      // 3rd rapid request -> blocked by short window (limit: 2 in 1s)
      await expect(guard.canActivate(ctx)).rejects.toThrow(ThrottlerException);
    });

    it('should track rate limits per client IP independently', async () => {
      const ctxA = createMockContext(controller.refresh, '198.51.100.21');
      const ctxB = createMockContext(controller.refresh, '198.51.100.22');

      // IP A makes 2 requests
      await expect(guard.canActivate(ctxA)).resolves.toBe(true);
      await expect(guard.canActivate(ctxA)).resolves.toBe(true);
      await expect(guard.canActivate(ctxA)).rejects.toThrow(ThrottlerException);

      // IP B should NOT be blocked by IP A's activity
      await expect(guard.canActivate(ctxB)).resolves.toBe(true);
      await expect(guard.canActivate(ctxB)).resolves.toBe(true);
    });

    it('should block 2nd rapid call on /signin (limit: 1 per 1s)', async () => {
      const ctx = createMockContext(controller.signin, '198.51.100.30');

      // 1st request -> allowed
      await expect(guard.canActivate(ctx)).resolves.toBe(true);

      // 2nd rapid request within 1s -> blocked (limit: 1 in 1s)
      await expect(guard.canActivate(ctx)).rejects.toThrow(ThrottlerException);
    });
  });
});
