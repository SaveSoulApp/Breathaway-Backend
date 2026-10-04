jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-id',
}));

import { GoneException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '@common/guards';
import { LoggerService } from '@core/logger';
import { AdminOidcAuthGuard } from '@modules/admin/guards/admin-oidc-auth.guard';

import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import {
  AuthSigninRequestDto,
  AuthSignupRequestDto,
  DevLoginRequestDto,
  RefreshTokenRequestDto,
} from '../dto';

describe('AuthController', () => {
  let controller: AuthController;
  let service: jest.Mocked<AuthService>;

  const mockSignupResponse = {
    userId: 'user-id-123',
    status: 'pending_verification',
  };

  const mockSigninResponse = {
    userId: 'user-id-123',
    tokenType: 'Bearer',
    accessToken: 'mock-access-token',
    expiresIn: 900,
    refreshToken: 'mock-refresh-token',
    refreshTokenExpiresAt: '2026-10-18T00:00:00.000Z',
  };

  beforeEach(async () => {
    const mockAuthService = {
      signup: jest.fn(),
      signin: jest.fn(),
      signInOrSignUp: jest.fn(),
      socialAuth: jest.fn(),
      devLogin: jest.fn(),
      addSecondaryAuth: jest.fn(),
      refresh: jest.fn(),
      signout: jest.fn(),
      deleteAccount: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    })
      .overrideGuard(AdminOidcAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get(AuthService);
  });

  describe('signup', () => {
    it('should sign up a user and forward request metadata', async () => {
      const dto: AuthSignupRequestDto = {
        uid: 'uid-123',
        uidToken: 'token-123',
      };
      service.signup.mockResolvedValue(mockSignupResponse);

      const result = await controller.signup(
        dto,
        '203.0.113.1',
        'BreathAway/1.0.0 (iOS 17.0; iPhone15)',
        'device-uuid-1',
      );

      expect(service.signup).toHaveBeenCalledWith(dto, {
        ipAddress: '203.0.113.1',
        userAgent: 'BreathAway/1.0.0 (iOS 17.0; iPhone15)',
        deviceId: 'device-uuid-1',
      });
      expect(result).toEqual(mockSignupResponse);
    });
  });

  describe('signin', () => {
    it('should sign in a user and forward request metadata', async () => {
      const dto: AuthSigninRequestDto = {
        uid: 'uid-123',
        uidToken: 'token-123',
      };
      service.signin.mockResolvedValue(mockSigninResponse);

      const result = await controller.signin(
        dto,
        '203.0.113.2',
        'Mozilla/5.0',
        'device-uuid-2',
      );

      expect(service.signin).toHaveBeenCalledWith(dto, {
        ipAddress: '203.0.113.2',
        userAgent: 'Mozilla/5.0',
        deviceId: 'device-uuid-2',
      });
      expect(result).toEqual(mockSigninResponse);
    });
  });

  describe('addPhone', () => {
    it('should add a secondary phone credential with metadata', async () => {
      const dto = { uid: 'uid-phone-123', uidToken: 'token-phone-123' };
      service.addSecondaryAuth.mockResolvedValue(mockSigninResponse);

      const result = await controller.addPhone(
        'user-id-123',
        dto,
        '203.0.113.3',
        'TestAgent',
        'device-uuid-3',
      );

      expect(service.addSecondaryAuth).toHaveBeenCalledWith(
        'user-id-123',
        dto,
        'phone',
        {
          ipAddress: '203.0.113.3',
          userAgent: 'TestAgent',
          deviceId: 'device-uuid-3',
        },
      );
      expect(result).toEqual(mockSigninResponse);
    });
  });

  describe('addEmail', () => {
    it('should add a secondary email credential with metadata', async () => {
      const dto = { uid: 'uid-email-123', uidToken: 'token-email-123' };
      service.addSecondaryAuth.mockResolvedValue(mockSigninResponse);

      const result = await controller.addEmail(
        'user-id-123',
        dto,
        '203.0.113.4',
        'TestAgent',
        'device-uuid-4',
      );

      expect(service.addSecondaryAuth).toHaveBeenCalledWith(
        'user-id-123',
        dto,
        'password',
        {
          ipAddress: '203.0.113.4',
          userAgent: 'TestAgent',
          deviceId: 'device-uuid-4',
        },
      );
      expect(result).toEqual(mockSigninResponse);
    });
  });

  describe('socialAuth', () => {
    it('should throw GoneException when social auth endpoint is called', () => {
      expect(() => controller.socialAuth({})).toThrow(GoneException);
    });
  });

  describe('signinOrSignup', () => {
    it('should invoke authService.signInOrSignUp with metadata and return result', async () => {
      const dto: AuthSigninRequestDto = {
        uid: 'uid-123',
        uidToken: 'token-123',
      };
      service.signInOrSignUp.mockResolvedValue(mockSigninResponse);

      const result = await controller.signinOrSignup(
        dto,
        '203.0.113.5',
        'TestAgent',
        'device-uuid-5',
      );

      expect(service.signInOrSignUp).toHaveBeenCalledWith(dto, {
        ipAddress: '203.0.113.5',
        userAgent: 'TestAgent',
        deviceId: 'device-uuid-5',
      });
      expect(result).toEqual(mockSigninResponse);
    });
  });

  describe('devLogin', () => {
    it('should invoke authService.devLogin with developer credentials and metadata', async () => {
      const dto: DevLoginRequestDto = { identifier: 'dev@breathaway.test' };
      const mockDevResponse = {
        ...mockSigninResponse,
        userId: 'dev-user-1',
      };
      service.devLogin.mockResolvedValue(mockDevResponse);

      const result = await controller.devLogin(
        dto,
        '127.0.0.1',
        'DevClient',
        'device-dev-1',
      );

      expect(service.devLogin).toHaveBeenCalledWith(dto, {
        ipAddress: '127.0.0.1',
        userAgent: 'DevClient',
        deviceId: 'device-dev-1',
      });
      expect(result).toEqual(mockDevResponse);
    });
  });

  describe('refresh', () => {
    it('should refresh tokens with metadata and return the rotated credentials', async () => {
      const dto: RefreshTokenRequestDto = {
        refreshToken: 'valid-refresh-token',
      };
      service.refresh.mockResolvedValue(mockSigninResponse);

      const result = await controller.refresh(
        dto,
        '203.0.113.6',
        'RefreshAgent',
        'device-refresh-1',
      );

      expect(service.refresh).toHaveBeenCalledWith(dto, {
        ipAddress: '203.0.113.6',
        userAgent: 'RefreshAgent',
        deviceId: 'device-refresh-1',
      });
      expect(result).toEqual(mockSigninResponse);
    });
  });

  describe('signout', () => {
    it('should sign out the user and return confirmation message without refreshToken', async () => {
      const mockSignoutResponse = { message: 'Signout successful' };
      service.signout.mockResolvedValue(mockSignoutResponse);

      const result = await controller.signout('user-id-123');

      expect(service.signout).toHaveBeenCalledWith('user-id-123', undefined);
      expect(result).toEqual(mockSignoutResponse);
    });

    it('should sign out the user and pass refreshToken when provided', async () => {
      const mockSignoutResponse = { message: 'Signout successful' };
      service.signout.mockResolvedValue(mockSignoutResponse);

      const result = await controller.signout('user-id-123', {
        refreshToken: 'specific-token',
      });

      expect(service.signout).toHaveBeenCalledWith(
        'user-id-123',
        'specific-token',
      );
      expect(result).toEqual(mockSignoutResponse);
    });
  });

  describe('deleteAccount', () => {
    it('should invoke authService.deleteAccount with userId and dto', async () => {
      const dto = { confirmation: 'DELETE_MY_ACCOUNT', reason: 'Leaving' };
      service.deleteAccount.mockResolvedValue(undefined);

      await controller.deleteAccount('user-id-123', dto);

      expect(service.deleteAccount).toHaveBeenCalledWith('user-id-123', dto);
    });
  });
});
