jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-id',
}));

import { GoneException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { BasicAuthGuard, JwtAuthGuard } from '@common/guards';
import { LoggerService } from '@core/logger';

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
    access_token: 'mock-access-token',
    user_id: 'user-id-123',
    userId: 'user-id-123',
    token_type: 'Bearer',
    expires_in: 900,
    refresh_token: 'mock-refresh-token',
    refresh_token_expires_at: '2026-10-18T00:00:00.000Z',
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
      .overrideGuard(BasicAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get(AuthService);
  });

  describe('signup', () => {
    it('should sign up a user and return the response', async () => {
      const dto: AuthSignupRequestDto = {
        uid: 'uid-123',
        uidToken: 'token-123',
      };
      service.signup.mockResolvedValue(mockSignupResponse);

      const result = await controller.signup(dto);

      expect(service.signup).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockSignupResponse);
    });
  });

  describe('signin', () => {
    it('should sign in a user and return the credentials', async () => {
      const dto: AuthSigninRequestDto = {
        uid: 'uid-123',
        uidToken: 'token-123',
      };
      service.signin.mockResolvedValue(mockSigninResponse);

      const result = await controller.signin(dto);

      expect(service.signin).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockSigninResponse);
    });
  });

  describe('addPhone', () => {
    it('should add a secondary phone credential', async () => {
      const dto = { uid: 'uid-phone-123', uidToken: 'token-phone-123' };
      service.addSecondaryAuth.mockResolvedValue(mockSigninResponse);

      const result = await controller.addPhone('user-id-123', dto);

      expect(service.addSecondaryAuth).toHaveBeenCalledWith(
        'user-id-123',
        dto,
        'phone',
      );
      expect(result).toEqual(mockSigninResponse);
    });
  });

  describe('addEmail', () => {
    it('should add a secondary email credential', async () => {
      const dto = { uid: 'uid-email-123', uidToken: 'token-email-123' };
      service.addSecondaryAuth.mockResolvedValue(mockSigninResponse);

      const result = await controller.addEmail('user-id-123', dto);

      expect(service.addSecondaryAuth).toHaveBeenCalledWith(
        'user-id-123',
        dto,
        'password',
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
    it('should invoke authService.signInOrSignUp and return result', async () => {
      const dto: AuthSigninRequestDto = {
        uid: 'uid-123',
        uidToken: 'token-123',
      };
      service.signInOrSignUp.mockResolvedValue(mockSigninResponse);

      const result = await controller.signinOrSignup(dto);

      expect(service.signInOrSignUp).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockSigninResponse);
    });
  });

  describe('devLogin', () => {
    it('should invoke authService.devLogin with developer credentials', async () => {
      const dto: DevLoginRequestDto = { identifier: 'dev@breathaway.test' };
      const mockDevResponse = {
        ...mockSigninResponse,
        user_id: 'dev-user-1',
      };
      service.devLogin.mockResolvedValue(mockDevResponse);

      const result = await controller.devLogin(dto);

      expect(service.devLogin).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockDevResponse);
    });
  });

  describe('refresh', () => {
    it('should refresh tokens and return the rotated credentials', async () => {
      const dto: RefreshTokenRequestDto = {
        refreshToken: 'valid-refresh-token',
      };
      service.refresh.mockResolvedValue(mockSigninResponse);

      const result = await controller.refresh(dto);

      expect(service.refresh).toHaveBeenCalledWith(dto);
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
