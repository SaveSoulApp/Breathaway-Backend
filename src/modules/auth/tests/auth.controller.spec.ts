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
  };

  beforeEach(async () => {
    const mockAuthService = {
      signup: jest.fn(),
      signin: jest.fn(),
      signInOrSignUp: jest.fn(),
      socialAuth: jest.fn(),
      devLogin: jest.fn(),
      addSecondaryAuth: jest.fn(),
      signout: jest.fn(),
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
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('signup', () => {
    it('should sign up a user and return the user credentials', async () => {
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
      const mockResponse = {
        access_token: 'mock-access-token',
        user_id: 'user-id-123',
      };
      service.addSecondaryAuth.mockResolvedValue(mockResponse);

      const result = await controller.addPhone('user-id-123', dto);

      expect(service.addSecondaryAuth).toHaveBeenCalledWith(
        'user-id-123',
        dto,
        'phone',
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('addEmail', () => {
    it('should add a secondary email credential', async () => {
      const dto = { uid: 'uid-email-123', uidToken: 'token-email-123' };
      const mockResponse = {
        access_token: 'mock-access-token',
        user_id: 'user-id-123',
      };
      service.addSecondaryAuth.mockResolvedValue(mockResponse);

      const result = await controller.addEmail('user-id-123', dto);

      expect(service.addSecondaryAuth).toHaveBeenCalledWith(
        'user-id-123',
        dto,
        'password',
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('signinOrSignup', () => {
    it('should sign in or sign up a user and return credentials', async () => {
      const dto: AuthSigninRequestDto = {
        uid: 'uid-123',
        uidToken: 'token-123',
      };
      service.signInOrSignUp.mockResolvedValue(mockSigninResponse as any);

      const result = await controller.signinOrSignup(dto);

      expect(service.signInOrSignUp).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockSigninResponse);
    });
  });

  describe('socialAuth', () => {
    it('should throw GoneException and not invoke authService.socialAuth', () => {
      // Arrange & Act & Assert
      expect(() => controller.socialAuth({})).toThrow(GoneException);
      expect(service.socialAuth).not.toHaveBeenCalled();
    });
  });

  describe('devLogin', () => {
    it('should authenticate a dev user and return user credentials', async () => {
      const dto: DevLoginRequestDto = {
        identifier: 'dev@example.com',
      };
      const mockDevResponse = {
        access_token: 'mock-dev-token',
        user_id: 'user-dev-123',
      };
      service.devLogin.mockResolvedValue(mockDevResponse as any);

      const result = await controller.devLogin(dto);

      expect(service.devLogin).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockDevResponse);
    });
  });

  describe('signout', () => {
    it('should sign out the user and return confirmation message', () => {
      const mockSignoutResponse = { message: 'Signout successful' };
      service.signout.mockReturnValue(mockSignoutResponse);

      const result = controller.signout('user-id-123');

      expect(service.signout).toHaveBeenCalledWith('user-id-123');
      expect(result).toEqual(mockSignoutResponse);
    });
  });
});
