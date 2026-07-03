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
      forContext: jest.fn().mockReturnValue({ log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() }),
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
});
