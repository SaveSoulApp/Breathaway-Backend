jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-id',
}));

import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import { BasicAuthGuard, JwtAuthGuard } from '@common/guards';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { AuthSignupRequestDto, AuthSigninRequestDto } from '../dto';

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
});
